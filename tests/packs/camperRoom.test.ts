import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPER_SPEC } from "../../src/domain/vehicle/kinds/camper/spec";
import {
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_WALL_BLOCK,
  ROOM_FACE_STATE,
  ROOM_OPEN_STATE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const BP = "packs/yasu_ride_bp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const readBlock = (name: string) =>
  read(`${BP}/blocks/yasu_ride/camper_${name}.block.json`);
const fullCell = { origin: [-8, 0, -8], size: [16, 16, 16] };
const ceilingPlate = { origin: [-8, 13, -8], size: [16, 3, 16] };
const wallPlates = [
  { origin: [-8, 0, -8], size: [16, 16, 2] },
  { origin: [-8, 0, 6], size: [16, 16, 2] },
  { origin: [6, 0, -8], size: [2, 16, 16] },
  { origin: [-8, 0, -8], size: [2, 16, 16] },
];

describe("Camper room blocks (ADR 0068)", () => {
  it.each([
    ["floor", CAMPER_FLOOR_BLOCK],
    ["ceiling", CAMPER_CEILING_BLOCK],
    ["wall", CAMPER_WALL_BLOCK],
    ["door", CAMPER_DOOR_BLOCK],
  ])(
    "defines an invisible, indestructible %s with the script's identifier",
    (name, identifier) => {
      const file = readBlock(name);
      const block = file["minecraft:block"];
      expect(file.format_version).toBe("1.21.80");
      expect(block.description.identifier).toBe(identifier);
      expect(block.description.menu_category).toEqual({ category: "none" });
      expect(block.components["minecraft:geometry"]).toBe(
        "geometry.yasu_ride.deck_floor",
      );
      expect(block.components["minecraft:destructible_by_mining"]).toBe(false);
      expect(block.components["minecraft:destructible_by_explosion"]).toBe(
        false,
      );
      expect(block.components).not.toHaveProperty("minecraft:loot");
      expect(block.components["minecraft:light_dampening"]).toBe(0);
      expect(block.components["minecraft:material_instances"]).toEqual({
        "*": { texture: "glass", render_method: "alpha_test" },
      });
      expect(block.components).not.toHaveProperty(
        "minecraft:custom_components",
      );
    },
  );

  it.each([
    ["floor", fullCell],
    ["ceiling", ceilingPlate],
  ] as const)(
    "makes the %s selectable with its collision shape",
    (name, box) => {
      const block = readBlock(name)["minecraft:block"];
      expect(block.components["minecraft:collision_box"]).toEqual(box);
      expect(block.components["minecraft:selection_box"]).toEqual(box);
    },
  );

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

it("keeps only a bumper hitbox from spawn and preserves the camper's body collision", () => {
  const entity = read(`${BP}/entities/yasu_ride/camper.se.json`)[
    "minecraft:entity"
  ];
  expect(entity.components["minecraft:custom_hit_test"].hitboxes).toEqual([
    { width: 1, height: 1, pivot: [0, 0.5, CAMPER_SPEC.bodyFront] },
  ]);
  expect(entity.components["minecraft:collision_box"]).toEqual({
    width: 3,
    height: 4,
  });
});
