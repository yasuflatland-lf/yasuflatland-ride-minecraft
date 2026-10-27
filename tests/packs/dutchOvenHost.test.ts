import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  FIRE_PIT_SPOTS,
  FIRE_PIT_TOP_PX,
  TABLE_SPOTS,
  TABLE_TOP_PX,
} from "../../src/domain/camp/spec";
import { type Bone, turnedCorners } from "../support/geometry";

it("stands the oven at the fire pit generator's grill top", () => {
  const generator = readFileSync("tools/gen_fire_pit.py", "utf8");
  const top = generator.match(/^GRILL_TOP = ([0-9.]+)$/m)?.[1];
  expect(top).toBeDefined();
  expect(FIRE_PIT_TOP_PX).toBe(Number(top));
  expect(FIRE_PIT_SPOTS).toEqual([{ x: 0, z: 0 }]);
});

it("anchors hosted ovens and restores collision and gravity on host loss", () => {
  const entity = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/entities/yasu_ride/dutch_oven.se.json",
      "utf8",
    ),
  )["minecraft:entity"];
  for (const [state, enabled] of [
    ["hosted", false],
    ["ground", true],
  ] as const) {
    const group = `yasu_ride:oven_${state}`;
    expect(entity.component_groups[group]["minecraft:physics"]).toEqual({
      has_collision: enabled,
      has_gravity: enabled,
    });
    expect(entity.events[group].add.component_groups).toEqual([group]);
    expect(entity.events[group].remove.component_groups).toEqual([
      `yasu_ride:oven_${state === "hosted" ? "ground" : "hosted"}`,
    ]);
  }
});

it("matches the generated tabletop height and fits both oven footprints within its halves", () => {
  const bones = (name: string): Bone[] =>
    JSON.parse(
      readFileSync(
        `packs/yasu_ride_rp/models/entity/yasu_ride/${name}.geo.json`,
        "utf8",
      ),
    )["minecraft:geometry"][0].bones;
  const table = bones("camp_table");
  const top = table
    .flatMap((bone) => bone.cubes ?? [])
    .find((cube) => cube.size[0] === 30 && cube.size[2] === 12);
  expect(top).toBeDefined();
  if (!top) return;
  expect(TABLE_TOP_PX).toBe(top.origin[1] + top.size[1]);
  expect(TABLE_SPOTS).toEqual([
    { x: -7.5, z: 0 },
    { x: 7.5, z: 0 },
  ]);
  for (const spot of TABLE_SPOTS) {
    for (const bone of bones("dutch_oven")) {
      for (const cube of bone.cubes ?? []) {
        for (const [x, , z] of turnedCorners(bone, cube)) {
          expect(Math.abs(spot.x + x)).toBeLessThanOrEqual(15);
          expect(Math.abs(spot.z + z)).toBeLessThanOrEqual(6);
          expect(Math.abs(x)).toBeLessThanOrEqual(7.5);
        }
      }
    }
  }
});
