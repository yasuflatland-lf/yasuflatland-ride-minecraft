import { existsSync, globSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

type Bone = { cubes?: { uv: number[] | Record<string, unknown> }[] };
type Geometry = { description: { identifier: string }; bones: Bone[] };

function renderBudget(bones: Bone[]) {
  let faces = 0;
  let cubes = 0;
  for (const bone of bones) {
    for (const { uv } of bone.cubes ?? []) {
      faces += Array.isArray(uv) ? 6 : Object.keys(uv).length;
      cubes++;
    }
  }
  return { faces, cubes };
}

it("counts three per-face UVs and six box UV faces across two cubes", () => {
  const face = { uv: [0, 0] };
  const bones = [
    { cubes: [{ uv: { north: face, east: face, up: face } }] },
    { cubes: [{ uv: [0, 0] }] },
  ];
  expect(renderBudget(bones)).toEqual({ faces: 9, cubes: 2 });
});

for (const path of globSync(
  "packs/{yasu_ride_rp,yasu_ride_test_rp}/**/*.geo.json",
)) {
  const file: { "minecraft:geometry": Geometry[] } = JSON.parse(
    readFileSync(path, "utf8"),
  );
  for (const { description, bones } of file["minecraft:geometry"]) {
    it(`matches the render budget for ${description.identifier}`, () => {
      const id = description.identifier.replace(/^geometry\./, "");
      const fixture = `tests/packs/fixtures/render-budget/${id}.json`;
      const actual = renderBudget(bones);
      expect(
        existsSync(fixture),
        `Commit ${fixture} with ${JSON.stringify(actual)}`,
      ).toBe(true);
      expect(actual).toEqual(JSON.parse(readFileSync(fixture, "utf8")));
    });
  }
}
