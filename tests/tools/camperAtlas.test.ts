import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";

import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = async <T>(setup: string, result: string): Promise<T> =>
  JSON.parse(
    await python.run(
      [
        "import json, sys",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        "module = load_tool('camper_atlas')",
        setup,
        `print(json.dumps(${result}))`,
      ].join("\n"),
    ),
  );

type Region = [string, number, number, number, number];
type Face = { uv: number[]; uv_size: number[] };

describe("camper atlas", () => {
  // Main maximum 19.994 s (three runs); 4 x 19.994 = 79.976 s, rounded up to 90 s.
  it("writes only the khaki colour atlas and companion maps", {
    timeout: 90_000,
  }, () => {
    const temporary = mkdtempSync(join(tmpdir(), "camper-colour-"));
    try {
      cpSync("tools", join(temporary, "tools"), { recursive: true });
      const pack = join(temporary, "pack");
      execFileSync("python3", [
        "-I",
        join(temporary, "tools/gen_camper.py"),
        pack,
      ]);
      expect(
        readdirSync(join(pack, "textures/entity/yasu_ride"))
          .filter((name) => name.endsWith(".png"))
          .sort(),
      ).toEqual([
        "camper.png",
        "camper_lit.png",
        "camper_lit_mer.png",
        "camper_mer.png",
        "camper_mirror.png",
        "camper_mirror_mer.png",
      ]);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the one-row swatches without any regions", async () => {
    expect(
      await run(
        "atlas = module.Atlas(['white', 'glass'])",
        "[atlas.width, atlas.height, atlas.face('glass'), [atlas.pixel({'white': [1, 2, 3, 255], 'glass': [4, 5, 6, 110]}, x, 0) for x in range(atlas.width)]]",
      ),
    ).toEqual([
      2,
      1,
      { uv: [1, 0], uv_size: [1, 1] },
      [
        [1, 2, 3, 255],
        [4, 5, 6, 110],
      ],
    ]);
  });

  it("allocates bounded regions without overlaps or moving earlier UVs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 40 }),
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 64 }),
            fc.integer({ min: 1, max: 64 }),
          ),
          { minLength: 1, maxLength: 15 },
        ),
        async (swatches, sizes) => {
          const [width, height, regions, history, swatchFaces] = await run<
            [number, number, Region[], Region[][], Face[]]
          >(
            [
              `atlas = module.Atlas([str(i) for i in range(${swatches})])`,
              "history = []",
              `for i, (w, h) in enumerate(${JSON.stringify(sizes)}):`,
              "    atlas.allocate('panel' + str(i), w, h)",
              "    history.append(list(atlas.regions))",
            ].join("\n"),
            "[atlas.width, atlas.height, atlas.regions, history, [atlas.face(name) for name in atlas.swatches]]",
          );
          expect(width).toBe(Math.max(swatches, ...sizes.map(([w]) => w)));
          expect(height).toBe(1 + sizes.reduce((sum, [, h]) => sum + h, 0));
          expect(swatchFaces).toEqual(
            Array.from({ length: swatches }, (_, x) => ({
              uv: [x, 0],
              uv_size: [1, 1],
            })),
          );
          for (const [i, [, x, y, w, h]] of regions.entries()) {
            expect([w, h]).toEqual(sizes[i]);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(1);
            expect(x + w).toBeLessThanOrEqual(width);
            expect(y + h).toBeLessThanOrEqual(height);
            expect(history[i]).toEqual(regions.slice(0, i + 1));
            for (const [, ox, oy, ow, oh] of regions.slice(0, i)) {
              expect(
                x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y,
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it("maps region subrectangles to texels relative to the region origin", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 30 }),
        ),
        async ([dx, dy, w, h, previousHeight]) => {
          expect(
            await run(
              `atlas = module.Atlas(['white'])\natlas.allocate('first', 2, ${previousHeight})\nregion = atlas.allocate('panel', ${dx + w}, ${dy + h})`,
              `[atlas.face(region, (${dx}, ${dy}), (${w}, ${h})), atlas.face(region, (${dx}, ${dy}))]`,
            ),
          ).toEqual([
            { uv: [dx, 1 + previousHeight + dy], uv_size: [w, h] },
            { uv: [dx, 1 + previousHeight + dy], uv_size: [w, h] },
          ]);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("samples regions in local coordinates and leaves unused space transparent", async () => {
    expect(
      await run(
        [
          "atlas = module.Atlas(['white', 'glass'])",
          "atlas.allocate('panel', 3, 2)",
          "atlas.allocate('trim', 1, 1)",
          "colors = {'white': [1, 2, 3, 255], 'glass': [4, 5, 6, 110]}",
          "def pixel(r, x, y): return (x, y, r.h, 255)",
        ].join("\n"),
        "[[atlas.pixel(colors, x, y, pixel) for x in range(atlas.width)] for y in range(atlas.height)]",
      ),
    ).toEqual([
      [
        [1, 2, 3, 255],
        [4, 5, 6, 110],
        [0, 0, 0, 0],
      ],
      [
        [0, 0, 2, 255],
        [1, 0, 2, 255],
        [2, 0, 2, 255],
      ],
      [
        [0, 1, 2, 255],
        [1, 1, 2, 255],
        [2, 1, 2, 255],
      ],
      [
        [0, 0, 1, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    ]);
  });

  it("rejects invalid allocations and faces without changing the atlas", async () => {
    expect(
      await run(
        [
          "atlas = module.Atlas(['white'])",
          "region = atlas.allocate('panel', 4, 3)",
          "errors = []",
          "for call in [lambda: atlas.allocate('bad', 0, 1), lambda: atlas.allocate('bad', 1, -1), lambda: atlas.allocate('bad', 1.5, 2), lambda: atlas.allocate('panel', 2, 2), lambda: atlas.allocate('white', 1, 1), lambda: atlas.face(region, (3, 0), (2, 1)), lambda: atlas.face(region, (-1, 0))]:",
          "    try: call()",
          "    except ValueError: errors.append(True)",
        ].join("\n"),
        "[len(errors), atlas.width, atlas.height, atlas.regions]",
      ),
    ).toEqual([7, 4, 4, [["panel", 0, 1, 4, 3]]]);
  });

  it("passes region faces through boxes and excludes them from swatch extraction", async () => {
    expect(
      await run(
        [
          "camper = load_tool('camper_kit')",
          "region = camper.ATLAS.allocate('ribbed_panel', 20, 3)",
          "panel = camper.box(0, 0, 0, 1, 1, 1, region, offset=(14, 1), uv_size=(1, 1))",
          "lamp = camper.box(0, 0, 0, 1, 1, 1, 'lens')",
          "taken, rest = camper.take_slots([panel, lamp], ['lens'])",
          "base_x, base_y = camper.LAYOUT.origin('base')",
          "for face in panel['uv'].values():",
          "    face['uv'][0] -= base_x",
          "    face['uv'][1] -= base_y + region.y",
        ].join("\n"),
        "[panel['uv'], taken == [lamp], rest == [panel]]",
      ),
    ).toEqual([
      Object.fromEntries(
        ["north", "south", "east", "west", "up", "down"].map((side) => [
          side,
          { uv: [14, 1], uv_size: [1, 1] },
        ]),
      ),
      true,
      true,
    ]);
  });
});
