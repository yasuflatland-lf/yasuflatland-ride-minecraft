import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { expect, it } from "vitest";

const python = (body: string, input: unknown = null) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import json, sys
sys.path.insert(0, 'tools')
import gear_validate as g
from gear_atlas import face
value = json.loads(sys.stdin.read())
${body}
`,
      ],
      { input: JSON.stringify(input), encoding: "utf8" },
    ),
  );

it("enforces the inclusive item budget across counts", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 600 }), {
        minLength: 1,
        maxLength: 30,
      }),
      (counts) => {
        const errors: string[][] = python(
          'print(json.dumps([g.item_budget_errors("fixture", [{}] * n) for n in value]))',
          counts,
        );
        counts.forEach((count, i) => {
          expect(errors[i]?.length).toBe(count > 256 ? 1 : 0);
          if (count > 256) {
            expect(errors[i]?.[0]).toContain(`fixture: ${count}`);
            expect(errors[i]?.[0]).toContain("256");
          }
        });
      },
    ),
    { numRuns: 10 },
  );
  expect(
    python(
      'print(json.dumps([g.item_budget_errors("fixture", [{}] * n) for n in (256, 257)]))',
    ),
  ).toEqual([[], ["fixture: 257 cubes, over MAX_CUBES_PER_ITEM 256"]]);
});

it("counts both pair ends with repetition allowed", () => {
  expect(
    python(`
print(json.dumps([
    g.pair_budget_errors("table", {"large": 300, "small": 250}),
    g.pair_budget_errors("shelf", {"alone": 257}),
    g.pair_budget_errors("table", {"fits": 256}),
    g.pair_budget_errors("empty", {})]))
`),
  ).toEqual([
    [
      "table pair: large + large = 600 visible cubes, over MAX_CUBES_PER_PAIR_BLOCK 512",
    ],
    [
      "shelf pair: alone + alone = 514 visible cubes, over MAX_CUBES_PER_PAIR_BLOCK 512",
    ],
    [],
    [],
  ]);
});

it("reports forbidden rotations and UVs and accepts mirrored swatches and assigned tiles", () => {
  const result = python(`
def cube(uv):
    return {"uv": {"north": uv}}
def check(uv, tiles={}):
    return g.uv_errors("fixture", [cube(uv)], tiles)
print(json.dumps({
    "rotation": g.rotation_errors("fixture", [{"rotation": [1, 2, 3]}, {"rotation": [1, 2, 0]}]),
    "outside": check({"uv": [20, 20], "uv_size": [2, 2]}),
    "tile": check({"uv": [132, 4], "uv_size": [120, 120]}, {"fixture": 1}),
    "unassigned": check({"uv": [132, 4], "uv_size": [2, 2]}),
    "gutter": check({"uv": [131, 4], "uv_size": [2, 2]}, {"fixture": 1}),
    "mirror": check({"uv": [4, 4], "uv_size": [-4, -4]})}))
`);
  expect(result.rotation).toEqual([
    "fixture: cube 0 has three rotation axes, at most two allowed",
  ]);
  expect(result.outside[0]).toContain(
    "fixture: cube 0 face north UV (20, 20, 22, 22)",
  );
  expect(result.tile).toEqual([]);
  expect(result.unassigned).toHaveLength(1);
  expect(result.gutter).toHaveLength(1);
  expect(result.mirror).toEqual([]);
});

it("samples every positively overlapped texel and enforces glass alpha ranges", () => {
  expect(
    python(`
pixels = bytes(c for a in (0, 64, 110, 255) for c in (1, 2, 3, a))
cubes = [{"uv": {"north": {"uv": [1.5, 1], "uv_size": [-1, -1]}}}]
assert g.sampled_alphas(cubes, pixels, 2) == {0, 64}
assert g.sampled_alphas([{"uv": {"north": {"uv": [0, 0], "uv_size": [1, 1]}}}], pixels, 2) == {0}
print(json.dumps([
    g.alpha_errors("glass", True, {255}),
    g.alpha_errors("solid", False, {110}),
    g.alpha_errors("glass", True, {0, 110, 255}),
    g.alpha_errors("glass", True, {1, 63, 64, 192, 193, 254})]))
`),
  ).toEqual([
    ["glass: glass requires translucent alpha 64..192, sampled [255]"],
    ["solid: forbidden alpha values [110]"],
    [],
    ["glass: forbidden alpha values [1, 63, 193, 254]"],
  ]);
});

it("validates the current catalog unchanged", () => {
  expect(
    python(`
import gen_camping_gear as generator
generator.validate(json.loads(generator.SPEC.read_text()))
print(json.dumps(True))
`),
  ).toBe(true);
});
