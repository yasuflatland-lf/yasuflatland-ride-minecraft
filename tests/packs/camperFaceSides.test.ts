import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Bone } from "../support/geometry";

const geometry = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
    "utf8",
  ),
)["minecraft:geometry"][0] as { bones: Bone[] };
const body = geometry.bones.find(({ name }) => name === "body")?.cubes ?? [];
const trim = body.filter(
  ({ origin, size }) => size[0] <= 0.15 && origin[0] + size[0] <= -23.9,
);

it("keeps the camper left outer trim's minimum-x east faces (ADR 0259)", () => {
  expect(trim.length).toBeGreaterThan(0);
  for (const cube of trim) {
    expect(cube.uv, JSON.stringify(cube)).toHaveProperty("east");
  }
});

it("culls the camper trim's maximum-x west faces touching a wall panel at x = -24", () => {
  // Window frames can span several panels; ADR 0256 requires one covering cube.
  const walls = body.filter(
    ({ origin, size, rotation }) =>
      origin[0] === -24 && size[0] === 1 && !rotation?.some(Boolean),
  );
  expect(walls.length).toBeGreaterThan(0);
  const flush = trim.filter(
    ({ origin, size }) =>
      Math.abs(origin[0] + size[0] + 24) < 1e-6 &&
      walls.some((wall) =>
        ([1, 2] as const).every(
          (axis) =>
            origin[axis] >= wall.origin[axis] - 1e-6 &&
            origin[axis] + size[axis] <=
              wall.origin[axis] + wall.size[axis] + 1e-6,
        ),
      ),
  );
  expect(flush.length).toBeGreaterThan(0);
  for (const cube of flush) {
    expect(cube.uv, JSON.stringify(cube)).not.toHaveProperty("west");
  }
});
