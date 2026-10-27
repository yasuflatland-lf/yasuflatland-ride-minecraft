import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { FIRE_PIT_SPOTS, FIRE_PIT_TOP_PX } from "../../src/domain/camp/spec";

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
