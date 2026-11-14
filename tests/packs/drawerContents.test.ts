import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { KITCHEN_DRAWERS } from "../../src/domain/vehicle/kinds/camper/furniture";
import { DRAWER_GEAR_IDS } from "../../src/domain/vehicle/kinds/camper/spec";
import { defined } from "../support/defined";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const block = read(
  "packs/yasu_ride_bp/blocks/yasu_ride/drawers_decor_pair.block.json",
)["minecraft:block"];
const bones = read(
  "packs/yasu_ride_rp/models/blocks/yasu_ride/drawers_decor_pair.geo.json",
)["minecraft:geometry"][0].bones as {
  name: string;
  cubes: { origin: number[]; pivot?: number[] }[];
}[];
const visible = (name: string, states: Record<string, number | boolean>) => {
  const expression = block.components["minecraft:geometry"].bone_visibility[
    name
  ] as string;
  return expression.split(" && ").every((term) => {
    const match = /^q\.block_state\('([^']+)'\) == (\d+|true)$/.exec(term);
    if (!match) throw new Error(`Unexpected visibility term: ${term}`);
    return (
      states[defined(match[1], "state")] ===
      (match[2] === "true" ? true : Number(match[2]))
    );
  });
};

describe("drawer compartment art", () => {
  it("uses fifteen bits within Bedrock's sixteen-bit state budget", () => {
    const states = block.description.states as Record<string, unknown[]>;
    expect(
      Object.values(states).reduce(
        (n, values) => n + Math.max(1, Math.ceil(Math.log2(values.length))),
        0,
      ),
    ).toBe(15);
    expect(states["yasu_ride:height"]).toBeUndefined();
    expect(states["yasu_ride:open"]).toBeUndefined();
    expect(block.permutations).toHaveLength(5);
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components["minecraft:custom_components"]).toEqual([
      "yasu_ride:camper_cabinet",
    ]);
  });

  it("independently shows only each open drawer's compact item code", () => {
    const items = [...DRAWER_GEAR_IDS];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: items.length }),
        fc.integer({ min: 0, max: items.length }),
        fc.boolean(),
        fc.boolean(),
        (top, bottom, topOpen, bottomOpen) => {
          const states = {
            "yasu_ride:top_drawer": topOpen ? top + 1 : 0,
            "yasu_ride:bottom_drawer": bottomOpen ? bottom + 1 : 0,
          };
          for (const [end, code, open] of [
            [0, top, topOpen],
            [1, bottom, bottomOpen],
          ] as const) {
            for (const [index, item] of items.entries()) {
              expect(visible(`end${end}_${item}`, states)).toBe(
                open && code === index + 1,
              );
            }
          }
        },
      ),
    );
  });

  it("reuses gear cubes at the open box center and each domain floor", () => {
    for (const [end, door] of KITCHEN_DRAWERS.doors.entries()) {
      const floor = defined(door.slots[0], "drawer slot").height;
      for (const item of DRAWER_GEAR_IDS) {
        const original = read(
          `packs/yasu_ride_rp/models/blocks/yasu_ride/${item}.geo.json`,
        )["minecraft:geometry"][0].bones[0].cubes;
        const moved = defined(
          bones.find((bone) => bone.name === `end${end}_${item}`),
          "item bone",
        );
        expect(moved.cubes).toHaveLength(original.length);
        moved.cubes.forEach((cube, index) => {
          for (const [axis, shift] of [8.6, floor, 0.45].entries()) {
            expect(
              defined(cube.origin[axis], "origin") -
                original[index].origin[axis],
            ).toBeCloseTo(shift, 3);
            if (cube.pivot)
              expect(
                defined(cube.pivot[axis], "pivot") -
                  original[index].pivot[axis],
              ).toBeCloseTo(shift, 3);
          }
        });
      }
    }
  });

  it("keeps counter gear at fourteen pixels independent of drawer state", () => {
    expect(
      visible("counter_potted_plant", {
        "yasu_ride:counter_page": 0,
        "yasu_ride:counter_item": 1,
        "yasu_ride:top_drawer": 0,
        "yasu_ride:bottom_drawer": 0,
      }),
    ).toBe(true);
    const counter = defined(
      bones.find((bone) => bone.name === "counter_potted_plant"),
      "counter bone",
    );
    expect(
      Math.min(...counter.cubes.map((cube) => defined(cube.origin[1], "y"))),
    ).toBe(14);
    expect(block.components["minecraft:geometry"].bone_visibility.anchor).toBe(
      false,
    );
  });
});
