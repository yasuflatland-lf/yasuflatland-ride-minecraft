import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

type Pixel = [number, number, number, number];
type Tile = Pixel[][];
type Palette = [number, number, number][];

const run = async <T>(
  expression: string,
  input: unknown = null,
): Promise<T> => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import wicker",
    "args = json.loads(sys.stdin.read())",
    `print(json.dumps(${expression}))`,
  ].join("\n");
  return JSON.parse(await python.run(script, JSON.stringify(input)));
};

const options = fc.record({
  size: fc.integer({ min: 1, max: 65 }),
  seed: fc.integer(),
  palette: fc.constantFrom("PALETTE_BLACK", "PALETTE_AMBER"),
  direction: fc.constantFrom("horizontal", "vertical"),
});
const tileCall =
  "wicker.weave_tile(getattr(wicker, args['palette']), args['size'], seed=args['seed'], direction=args['direction'])";

describe("wicker tiles", { timeout: 30_000 }, () => {
  it("is deterministic, square, opaque and confined to its palette", async () => {
    await fc.assert(
      fc.asyncProperty(options, async (args) => {
        const { first, second, palette } = await run<{
          first: Tile;
          second: Tile;
          palette: Palette;
        }>(
          `{'first': ${tileCall}, 'second': ${tileCall}, 'palette': [getattr(getattr(wicker, args['palette']), f) for f in ('strand','light','dark','gap')]}`,
          args,
        );
        expect(first).toEqual(second);
        expect(first).toHaveLength(args.size);
        const allowed = new Set(palette.map((rgb) => [...rgb, 255].join(",")));
        for (const row of first) {
          expect(row).toHaveLength(args.size);
          for (const pixel of row)
            expect(allowed.has(pixel.join(","))).toBe(true);
        }
      }),
    );
  });

  it("joins at every pixel of both opposite edges for arbitrary sizes", async () => {
    await fc.assert(
      fc.asyncProperty(options, async (args) => {
        // Sampling x + size must land on the same texel as x, so the last
        // column and row are followed by the first instead of repeating it.
        const wrapped = await run<boolean>(
          `(lambda p, t: all(p(x + 3 * args['size'], y + 2 * args['size']) == p(x, y) == tuple(t[y][x]) for x in range(args['size']) for y in range(args['size'])))(wicker.weave_sampler(getattr(wicker, args['palette']), args['size'], args['seed']), wicker.weave_tile(getattr(wicker, args['palette']), args['size'], seed=args['seed']))`,
          args,
        );
        expect(wrapped).toBe(true);
      }),
    );
  });

  it("gives amber a finer, banded weave than black", async () => {
    const [black, amber] = await run<[string[], string[]]>(
      `[[''.join('sLd.'[[tuple(c) for c in (p.strand,p.light,p.dark,p.gap)].index(tuple(px[:3]))] for px in row) for row in wicker.weave_tile(p, 32)] for p in (wicker.PALETTE_BLACK, wicker.PALETTE_AMBER)]`,
    );
    expect(amber).not.toEqual(black);
    const [blackSpec, amberSpec] = await run<[number[], number[]]>(
      "[[p.columns, p.rows, p.bands] for p in (wicker.PALETTE_BLACK, wicker.PALETTE_AMBER)]",
    );
    expect(amberSpec[0]).toBeGreaterThan(blackSpec[0] as number);
    expect(blackSpec[2]).toBe(0);
    expect(amberSpec[2]).toBeGreaterThan(0);
  });

  it("transposes the entire weave when the strand direction changes", async () => {
    await fc.assert(
      fc.asyncProperty(options, async (args) => {
        const [horizontal, vertical] = await run<[Tile, Tile]>(
          `[wicker.weave_tile(getattr(wicker, args['palette']), args['size'], seed=args['seed'], direction=d) for d in ('horizontal', 'vertical')]`,
          args,
        );
        expect(vertical).toEqual(
          horizontal.map((_, y) => horizontal.map((row) => row[y])),
        );
      }),
    );
  });

  it("uses arbitrary caller palettes without introducing colors", async () => {
    const rgb = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255));
    await fc.assert(
      fc.asyncProperty(fc.tuple(rgb, rgb, rgb, rgb), async (palette) => {
        const tile = await run<Tile>(
          "wicker.weave_tile(wicker.WeavePalette(*(tuple(c) for c in args)))",
          palette,
        );
        const allowed = new Set(
          palette.map((color) => [...color, 255].join(",")),
        );
        for (const pixel of tile.flat())
          expect(allowed.has(pixel.join(","))).toBe(true);
      }),
    );
  });

  it("defaults to 16 pixels and gives both materials shading and seed variation", async () => {
    for (const palette of ["PALETTE_BLACK", "PALETTE_AMBER"]) {
      const [first, second, explicit] = await run<[Tile, Tile, Tile]>(
        `[wicker.weave_tile(wicker.${palette}), wicker.weave_tile(wicker.${palette}, seed=1), wicker.weave_tile(wicker.${palette}, 16, seed=0, direction='horizontal')]`,
      );
      expect(first).toHaveLength(16);
      expect(first).toEqual(explicit);
      expect(first).not.toEqual(second);
      expect(new Set(first.flat().map((pixel) => pixel.join(","))).size).toBe(
        4,
      );
    }
  });

  it("writes RGBA rows through the existing texture output callback", async () => {
    const script = [
      "import sys, tempfile",
      "from pathlib import Path",
      "sys.path.insert(0, 'tools')",
      "import wicker, texture_io",
      "from render_preview import read_png",
      "with tempfile.TemporaryDirectory() as directory:",
      "    path = Path(directory) / 'wicker.png'",
      "    for palette in (wicker.PALETTE_BLACK, wicker.PALETTE_AMBER):",
      "        tile = wicker.weave_tile(palette)",
      "        texture_io.Outputs(False).png(path, 16, 16, lambda x, y: tile[y][x])",
      "        assert read_png(path) == tile",
      "        check = texture_io.Outputs(True)",
      "        check.png(path, 16, 16, lambda x, y: tile[y][x])",
      "        assert not check.stale",
    ].join("\n");
    await python.run(script);
  });

  it("rejects nonpositive or noninteger sizes and unsupported directions", async () => {
    for (const size of ["0", "-1", "1.5", "True"]) {
      await expect(
        run(`wicker.weave_tile(wicker.PALETTE_BLACK, ${size})`),
      ).rejects.toThrow(/size must be a positive integer/);
    }
    await expect(
      run("wicker.weave_tile(wicker.PALETTE_BLACK, direction='diagonal')"),
    ).rejects.toThrow(/direction must be horizontal or vertical/);
  });
});
