import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const run = <T = number[]>(call: string, setup = ""): T => {
  const script = [
    "import json, sys, tempfile",
    "from pathlib import Path",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    "atlas = load_tool('mer_atlas')",
    "with tempfile.TemporaryDirectory() as directory:",
    "    path = Path(directory) / 'atlas.png'",
    ...setup
      .split("\n")
      .filter(Boolean)
      .map((line) => `    ${line}`),
    `    print(json.dumps(${call}))`,
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }),
  );
};

const byte = fc.integer({ min: 0, max: 255 });
const rgb = fc.tuple(byte, byte, byte);
const rgba = fc.tuple(byte, byte, byte, byte);
const palette = <T>(color: fc.Arbitrary<T>) =>
  fc.array(fc.tuple(color, rgb), { minLength: 16, maxLength: 16 });

const expectedPixels = (colors: number[][], streakRows: number): number[] =>
  Array.from({ length: 32 * 32 }, (_, pixel) => {
    const x = pixel % 32;
    const y = Math.floor(pixel / 32);
    const color = colors[Math.floor(y / 8) * 4 + Math.floor(x / 8)] as number[];
    const streak =
      y < streakRows ? Math.round(3 * Math.sin(x * 1.5 + y * 0.2)) : 0;
    return [
      ...color
        .slice(0, 3)
        .map((channel) => Math.max(0, Math.min(255, channel + streak))),
      color[3] ?? 255,
    ];
  }).flat();

describe("MER atlas", () => {
  it("keeps every RGB palette texel opaque with the default stainless streak", () => {
    fc.assert(
      fc.property(palette(rgb), (entries) => {
        const actual = run(
          `list(atlas.atlas_pixels(${JSON.stringify(entries)}))`,
        );
        expect(actual).toEqual(
          expectedPixels(
            entries.map(([color]) => color),
            16,
          ),
        );
      }),
    );
  });

  it("preserves RGBA alpha and changes only RGB in the requested streak rows", () => {
    fc.assert(
      fc.property(
        palette(rgba),
        fc.integer({ min: 0, max: 32 }),
        (entries, rows) => {
          const actual = run(
            `list(atlas.atlas_pixels(${JSON.stringify(entries)}, streak_rows=${rows}))`,
          );
          expect(actual).toEqual(
            expectedPixels(
              entries.map(([color]) => color),
              rows,
            ),
          );
        },
      ),
    );
  });

  it("keeps each MER swatch exact and opaque regardless of colour alpha", () => {
    fc.assert(
      fc.property(palette(fc.oneof(rgb, rgba)), (entries) => {
        const actual = run(
          `list(atlas.mer_pixels(${JSON.stringify(entries)}))`,
        );
        expect(actual).toEqual(
          expectedPixels(
            entries.map(([, material]) => material),
            0,
          ),
        );
      }),
    );
  });

  it("round-trips arbitrary RGBA bytes through an unfiltered PNG", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 4096, maxLength: 4096 }),
        (data) => {
          const actual = run(
            "list(atlas.read_png(path, 32))",
            `atlas.write_png(path, 32, bytes(${JSON.stringify([...data])}))`,
          );
          expect(actual).toEqual([...data]);
        },
      ),
    );
  });

  it("tiles the atlas with sixteen non-overlapping swatch faces", () => {
    const faces = run<{ uv: [number, number]; uv_size: [number, number] }[]>(
      "[atlas.face(slot) for slot in range(16)]",
    );
    const coverage = new Array<number>(32 * 32).fill(0);
    for (const {
      uv: [x, y],
      uv_size: [width, height],
    } of faces) {
      expect(width).toBe(8);
      expect(height).toBe(8);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(32);
      expect(y + height).toBeLessThanOrEqual(32);
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const index = (y + dy) * 32 + x + dx;
          coverage[index] = (coverage[index] as number) + 1;
        }
      }
    }
    expect(coverage).toEqual(new Array<number>(32 * 32).fill(1));
  });
});
