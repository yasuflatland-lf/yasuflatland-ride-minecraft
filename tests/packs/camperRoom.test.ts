import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECOR_SLOTS } from "../../src/domain/vehicle/kinds/camper/decor";
import { roomCells } from "../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../src/domain/vehicle/kinds/camper/spec";
import {
  CAMPER_BED_BLOCK,
  CAMPER_BED_COMPONENT,
  CAMPER_BUNK_BLOCK,
  CAMPER_CABINET_COMPONENT,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_DOOR_COMPONENT,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_SHOWER_TOILET_COMPONENT,
  CAMPER_WALL_BLOCK,
  DECOR_HEIGHT_STATE,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
  ROOM_OPEN_STATE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const BP = "packs/yasu_ride_bp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const readBlock = (name: string) =>
  read(`${BP}/blocks/yasu_ride/camper_${name}.block.json`);
const fullCell = { origin: [-8, 0, -8], size: [16, 16, 16] };
const bedBox = { origin: [-8, 0, -8], size: [16, 9, 16] };
const ceilingPlate = { origin: [-8, 13, -8], size: [16, 3, 16] };
const wallPlates = [
  { origin: [-8, 0, -8], size: [16, 16, 2] },
  { origin: [-8, 0, 6], size: [16, 16, 2] },
  { origin: [6, 0, -8], size: [2, 16, 16] },
  { origin: [-8, 0, -8], size: [2, 16, 16] },
];
const customComponents: Record<string, string[]> = {
  door: [CAMPER_DOOR_COMPONENT],
  bed: [CAMPER_BED_COMPONENT],
  bunk: [CAMPER_BED_COMPONENT],
  shower_toilet: [CAMPER_SHOWER_TOILET_COMPONENT],
  shower_door: [CAMPER_SHOWER_TOILET_COMPONENT],
  fridge_door: [CAMPER_CABINET_COMPONENT],
};

describe("Camper room blocks (ADR 0068)", () => {
  it.each([
    ["floor", CAMPER_FLOOR_BLOCK],
    ["ceiling", CAMPER_CEILING_BLOCK],
    ["wall", CAMPER_WALL_BLOCK],
    ["door", CAMPER_DOOR_BLOCK],
    ["bed", CAMPER_BED_BLOCK],
    ["bunk", CAMPER_BUNK_BLOCK],
    ["furniture", CAMPER_FURNITURE_BLOCK],
    ["shower_toilet", CAMPER_SHOWER_TOILET_BLOCK],
    ["shower_door", CAMPER_SHOWER_DOOR_BLOCK],
    ["fridge_door", CAMPER_FRIDGE_DOOR_BLOCK],
  ])(
    "defines an invisible, indestructible %s with the script's identifier",
    (name, identifier) => {
      const file = readBlock(name);
      const block = file["minecraft:block"];
      expect(file.format_version).toBe("1.21.80");
      expect(block.description.identifier).toBe(identifier);
      expect(block.description.menu_category).toEqual({ category: "none" });
      expect(block.components["minecraft:geometry"]).toEqual({
        identifier: "geometry.yasu_ride.deck_floor",
        bone_visibility: { root: false },
      });
      expect(block.components["minecraft:destructible_by_mining"]).toBe(false);
      expect(block.components["minecraft:destructible_by_explosion"]).toBe(
        false,
      );
      expect(block.components).not.toHaveProperty("minecraft:loot");
      expect(block.components["minecraft:light_dampening"]).toBe(0);
      expect(block.components["minecraft:material_instances"]).toEqual({
        "*": { texture: "glass", render_method: "alpha_test" },
      });
      const expected = customComponents[name];
      if (expected)
        expect(block.components["minecraft:custom_components"]).toEqual(
          expected,
        );
      else
        expect(block.components).not.toHaveProperty(
          "minecraft:custom_components",
        );
    },
  );

  it.each([
    ["floor", fullCell],
    ["ceiling", ceilingPlate],
    ["bed", bedBox],
  ] as const)(
    "makes the %s selectable with its collision shape",
    (name, box) => {
      const block = readBlock(name)["minecraft:block"];
      expect(block.components["minecraft:collision_box"]).toEqual(box);
      expect(block.components["minecraft:selection_box"]).toEqual(box);
    },
  );

  it("defines the upper bunk without collision, selectable over the bunk only (ADR 0182)", () => {
    const block = readBlock("bunk")["minecraft:block"];
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components["minecraft:selection_box"]).toEqual({
      origin: [-8, 0, -8],
      size: [16, 5.5, 16],
    });
    expect(block.components["tag:yasu_ride:laid"]).toEqual({});
  });

  it("defines a collisionless fridge door plate selectable on its face's side of the cell, the full cell high, giving a light block's glow only while lit (ADR 0115, 0123)", () => {
    const block = readBlock("fridge_door")["minecraft:block"];
    expect(block.description.states).toEqual({
      [ROOM_FACE_STATE]: [0, 1, 2, 3],
      [ROOM_LIT_STATE]: [false, true],
    });
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components).not.toHaveProperty("minecraft:selection_box");
    expect(block.components).not.toHaveProperty("minecraft:light_emission");
    expect(block.permutations).toEqual(
      wallPlates.flatMap((plate, face) =>
        [false, true].map((lit) => ({
          condition: `q.block_state('${ROOM_FACE_STATE}') == ${face} && q.block_state('${ROOM_LIT_STATE}') == ${lit}`,
          components: {
            "minecraft:selection_box": plate,
            // minecraft:light_block_15, the ceiling light it stands in for, gives 15.
            "minecraft:light_emission": lit ? 15 : 0,
          },
        })),
      ),
    );
  });

  it("defines a collisionless furniture block with one selection box per slot height (ADR 0097)", () => {
    const block = readBlock("furniture")["minecraft:block"];
    const heights = Array.from({ length: 16 }, (_, h) => h);
    expect(block.description.states).toEqual({
      [DECOR_HEIGHT_STATE]: heights,
    });
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components).not.toHaveProperty("minecraft:selection_box");
    expect(block.permutations).toEqual(
      heights.map((h) => ({
        condition: `q.block_state('${DECOR_HEIGHT_STATE}') == ${h}`,
        components: {
          "minecraft:selection_box":
            h === 0
              ? { origin: [-4, 6, -4], size: [8, 10, 8] }
              : { origin: [-8, 0, -8], size: [16, h, 16] },
        },
      })),
    );
  });

  it("covers each slot's furniture top (ADR 0097, 0102)", () => {
    const block = readBlock("furniture")["minecraft:block"];
    const boxOf = (height: number): { origin: number[]; size: number[] } =>
      block.permutations.find(
        (p: { condition: string }) =>
          p.condition === `q.block_state('${DECOR_HEIGHT_STATE}') == ${height}`,
      ).components["minecraft:selection_box"];
    for (const slot of DECOR_SLOTS) {
      const { origin, size } = boxOf(slot.hanging ? 0 : slot.height);
      const [bottom, top] = [origin[1], (origin[1] ?? 0) + (size[1] ?? 0)];
      if (slot.hanging !== true)
        expect([bottom, top], slot.id).toEqual([0, slot.height]);
      else {
        expect(bottom, slot.id).toBeGreaterThanOrEqual(0);
        expect(top, slot.id).toBe(16);
      }
    }
  });

  it("gives the shower-toilet no collision and a selectable 2 px plate on each face (ADR 0098)", () => {
    const block = readBlock("shower_toilet")["minecraft:block"];
    expect(block.description.states).toEqual({
      [ROOM_FACE_STATE]: [0, 1, 2, 3],
    });
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components).not.toHaveProperty("minecraft:selection_box");
    expect(block.permutations).toEqual(
      wallPlates.map((box, face) => ({
        condition: `q.block_state('yasu_ride:face') == ${face}`,
        components: { "minecraft:selection_box": box },
      })),
    );
  });

  it("makes the wall behind the open shower door the wall's plate, selectable on each face (ADR 0118)", () => {
    const block = readBlock("shower_door")["minecraft:block"];
    expect(block.description.states).toEqual({
      [ROOM_FACE_STATE]: [0, 1, 2, 3],
    });
    expect(block.components).not.toHaveProperty("minecraft:collision_box");
    expect(block.components).not.toHaveProperty("minecraft:selection_box");
    expect(block.permutations).toEqual(
      wallPlates.map((plate, face) => ({
        condition: `q.block_state('${ROOM_FACE_STATE}') == ${face}`,
        components: {
          "minecraft:collision_box": plate,
          "minecraft:selection_box": plate,
        },
      })),
    );
  });

  it("defines all four wall faces with no selection box", () => {
    const wall = readBlock("wall")["minecraft:block"];
    expect(wall.description.states).toEqual({
      [ROOM_FACE_STATE]: [0, 1, 2, 3],
    });
    expect(wall.components["minecraft:selection_box"]).toBe(false);
    expect(wall.permutations).toEqual(
      wallPlates.map((plate, face) => ({
        condition: `q.block_state('${ROOM_FACE_STATE}') == ${face}`,
        components: { "minecraft:collision_box": plate },
      })),
    );
  });

  it("defines one door permutation for every face and open state", () => {
    const door = readBlock("door")["minecraft:block"];
    expect(door.description.states).toEqual({
      [ROOM_FACE_STATE]: [0, 1, 2, 3],
      [ROOM_OPEN_STATE]: [false, true],
    });
    expect(door.permutations).toEqual(
      wallPlates.flatMap((plate, face) =>
        [false, true].map((open) => ({
          condition: `q.block_state('${ROOM_FACE_STATE}') == ${face} && q.block_state('${ROOM_OPEN_STATE}') == ${open}`,
          components: {
            "minecraft:selection_box": open ? fullCell : plate,
            "minecraft:collision_box": open ? false : plate,
          },
        })),
      ),
    );
  });
});

it("hides the camper's own hitbox in the parked floor block under its center and preserves the undocked camper's body collision", () => {
  const entity = read(`${BP}/entities/yasu_ride/camper.se.json`)[
    "minecraft:entity"
  ];
  // The bumper boxes stand on the bumper stand-in, since an entity's boxes never turn
  // with it; the camper keeps one box set from spawn, where no tap reaches it (ADR 0116).
  const size = CAMPER_SPEC.hiddenHitboxSize;
  expect(entity.components["minecraft:custom_hit_test"]).toEqual({
    hitboxes: [{ width: size, height: size, pivot: [0, size / 2, 0] }],
  });
  // A parked camper's feet are at the bottom of its center floor cell (ADR 0068), so the
  // box lies inside that full block, below its top face.
  const [box] = entity.components["minecraft:custom_hit_test"].hitboxes;
  expect(box.pivot[1] + box.height / 2).toBeLessThan(1);
  expect(box.width / 2).toBeLessThan(0.5);
  const pose = { x: 10.5, y: 64, z: -3.5, yaw: 90 };
  expect(
    roomCells(pose, false).find((c) => c.x === 10 && c.y === 64 && c.z === -4)
      ?.block.type,
  ).toBe("floor");
  expect(entity.component_groups).not.toHaveProperty([
    "yasu_ride:docked",
    "minecraft:custom_hit_test",
  ]);
  expect(
    entity.component_groups["yasu_ride:undocked"]["minecraft:collision_box"],
  ).toEqual({
    width: 3,
    height: 4,
  });
});
