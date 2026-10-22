import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPER_PROFILE } from "../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../src/domain/vehicle/kinds/camper/spec";
import type { StandInAxis } from "../../src/domain/vehicle/standIn";
import {
  isStandInEntity,
  STAND_IN_FAMILY,
  standInType,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../support/defined";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const RULE = defined(CAMPER_PROFILE.standIn, "camper stand-in");
const AXES: readonly StandInAxis[] = ["x", "z"];
const camper = read(`${BP}/entities/yasu_ride/camper.se.json`)[
  "minecraft:entity"
];

function standIn(axis: StandInAxis) {
  const name = standInType(RULE.name, axis).split(":")[1];
  return {
    file: read(`${BP}/entities/yasu_ride/${name}.se.json`),
    client: read(`${RP}/entity/yasu_ride/${name}.ce.json`),
  };
}

describe.each(AXES)("Camper bumper stand-in along %s (ADR 0116)", (axis) => {
  const { file, client } = standIn(axis);
  const entity = file["minecraft:entity"];
  const c = entity.components;

  it("is summonable, not spawnable, and in the stand-in family, not the vehicle family", () => {
    expect(file.format_version).toBe("1.21.80");
    expect(entity.description).toEqual({
      identifier: standInType(RULE.name, axis),
      is_spawnable: false,
      is_summonable: true,
    });
    expect(isStandInEntity(entity.description.identifier)).toBe(true);
    // "inanimate" keeps it out of the ram query (ADR 0083).
    expect(c["minecraft:type_family"]).toEqual({
      family: [STAND_IN_FAMILY, "inanimate"],
    });
  });

  it("holds the bumper boxes of ADR 0084 in a row along its axis, centered on its feet, from spawn", () => {
    expect(c["minecraft:custom_hit_test"]).toEqual({
      hitboxes: CAMPER_SPEC.bumperBoxXs.map((x) => ({
        width: CAMPER_SPEC.bumperBoxSize,
        height: CAMPER_SPEC.bumperBoxSize,
        pivot:
          axis === "x"
            ? [x, CAMPER_SPEC.bumperBoxY, 0]
            : [0, CAMPER_SPEC.bumperBoxY, x],
      })),
    });
    // A hit test set after spawn never reaches the client (ADR 0068, 0116).
    expect(entity.component_groups).toBeUndefined();
    expect(entity.events).toBeUndefined();
  });

  it("keeps a small collision box in its base components, which its hitboxes need (ADR 0068)", () => {
    const box = c["minecraft:collision_box"];
    expect(box).toEqual({ width: 0.2, height: 0.2 });
    expect(box.width).toBeLessThan(CAMPER_SPEC.bumperBoxSize);
  });

  it("neither falls, collides, nor gets pushed, and takes no damage", () => {
    expect(c["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:knockback_resistance"]).toEqual({ value: 1.0 });
    expect(c["minecraft:damage_sensor"]).toEqual({
      triggers: { cause: "all", deals_damage: "no" },
    });
    for (const absent of [
      "minecraft:loot",
      "minecraft:despawn",
      "minecraft:leashable",
      "minecraft:breathable",
      "minecraft:movement",
    ])
      expect(c).not.toHaveProperty([absent]);
  });

  it("offers the camper's interact button to players only, as a seat the script never lets anyone take", () => {
    expect(c["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: camper.components["minecraft:rideable"].interact_text,
      crouching_skip_interact: true,
      seats: [{ position: [0, 0.5, 0] }],
    });
  });

  it("draws nothing", () => {
    const description = client["minecraft:client_entity"].description;
    expect(client.format_version).toBe("1.10.0");
    expect(description.identifier).toBe(entity.description.identifier);
    expect(description.render_controllers).toEqual([
      "controller.render.default",
    ]);
    expect(existsSync(`${RP}/${description.textures.default}.png`)).toBe(true);
    const geometry = read(`${RP}/models/entity/yasu_ride/stand_in.geo.json`)[
      "minecraft:geometry"
    ];
    expect(geometry).toHaveLength(1);
    expect(geometry[0].description.identifier).toBe(
      description.geometry.default,
    );
    expect(geometry[0].bones).toEqual([{ name: "root", pivot: [0, 0, 0] }]);
  });
});

it("names only the kinds' stand-in types as stand-ins", () => {
  expect(isStandInEntity(standInType(RULE.name, "x"))).toBe(true);
  expect(isStandInEntity(standInType(RULE.name, "z"))).toBe(true);
  expect(isStandInEntity("yasu_ride:camper")).toBe(false);
  expect(isStandInEntity("yasu_ride:deck_seat")).toBe(false);
  expect(isStandInEntity(undefined)).toBe(false);
});
