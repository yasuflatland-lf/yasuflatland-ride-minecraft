import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TAP_TARGET_TYPE } from "../../src/infrastructure/build/identifiers";
import {
  CHAIR_KINDS,
  ROOF_TENT_FAMILY,
  TENT_FAMILY,
} from "../../src/infrastructure/camp/identifiers";
import { ENTITY_TYPE } from "../../src/infrastructure/vehicle/bedrock/identifiers";

import { type Json, jsonFileEntries, packFiles } from "../support/packFiles";

interface ServerEntity {
  description: { identifier: string; is_summonable: boolean };
  components: Json;
}

const entities = jsonFileEntries("packs/yasu_ride_bp/entities").map(
  ({ json }) => json["minecraft:entity"] as ServerEntity,
);

// All shipping entities currently share the same damage policy.
const damageExceptions = new Map<string, string>();
const immuneEntities = entities.filter(
  ({ description }) => !damageExceptions.has(description.identifier),
);

it("covers at least 19 damage-immune entities", () => {
  expect(immuneEntities.length).toBeGreaterThanOrEqual(19);
  for (const id of damageExceptions.keys()) {
    expect(entities.map(({ description }) => description.identifier)).toContain(
      id,
    );
  }
});

it.each(immuneEntities)(
  "$description.identifier rejects damage from every cause",
  ({ components }) => {
    expect(components["minecraft:damage_sensor"]).toEqual({
      triggers: { cause: "all", deals_damage: "no" },
    });
  },
);

const furnitureExceptions = new Map<string, string>([
  [TAP_TARGET_TYPE, "The wand target follows a temporary selection marker."],
  ...Object.values(ENTITY_TYPE).map(
    (id) => [id, "Drivable vehicles must move."] as const,
  ),
  [
    "yasu_ride:camper_bumper_x",
    "The script moves this stand-in with the camper.",
  ],
  [
    "yasu_ride:camper_bumper_z",
    "The script moves this stand-in with the camper.",
  ],
  ["yasu_ride:deck_seat", "This seat follows a boat."],
  ["yasu_ride:seat_filler", "This temporary rider is managed by the script."],
]);

const fixedInPlace = new Set([
  "yasu_ride:beach_parasol", // The stand anchors to its placement point.
  "yasu_ride:dining_table", // The placed tabletop block provides collision.
  "yasu_ride:tent", // The placed shelter blocks provide collision.
  "yasu_ride:roof_tent", // The host can carry the tent above the ground.
]);

const familyOverrides = new Map([
  ["yasu_ride:beach_chair", "beach_chair"], // Legacy script family.
  ["yasu_ride:beach_parasol", "beach_parasol"], // Legacy script family.
  ["yasu_ride:roof_tent", ROOF_TENT_FAMILY],
  ["yasu_ride:tent", TENT_FAMILY],
  ...Object.values(CHAIR_KINDS).map(
    ({ typeId, family }) => [typeId, family] as const,
  ),
]);

const furniture = entities
  .filter(({ description }) => !furnitureExceptions.has(description.identifier))
  .map((entity) => {
    const id = entity.description.identifier;
    const hasGravity = !fixedInPlace.has(id);
    return {
      ...entity,
      id,
      hasGravity,
      hasCollision: hasGravity,
      family: familyOverrides.get(id) ?? id.replace(":", "_"),
    };
  });

it("covers at least 16 furniture and gear entities", () => {
  expect(furniture.length).toBeGreaterThanOrEqual(16);
  for (const id of furnitureExceptions.keys()) {
    expect(entities.map(({ description }) => description.identifier)).toContain(
      id,
    );
  }
});

it.each(furniture)(
  "$id is summonable, persistent, and unpushable with its expected physics",
  ({ description, components, hasGravity, hasCollision, family }) => {
    expect(description.is_summonable).toBe(true);
    expect(components["minecraft:persistent"]).toEqual({});
    expect(components["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(components["minecraft:knockback_resistance"]).toEqual({ value: 1 });
    expect(components["minecraft:physics"]).toEqual({
      has_gravity: hasGravity,
      has_collision: hasCollision,
    });
    expect(components["minecraft:type_family"]).toEqual({
      family: [family, "inanimate"],
    });
  },
);

it("gives the temporary wand target a one-block hit box and a touch interaction", () => {
  const target = entities.find(
    ({ description }) => description.identifier === TAP_TARGET_TYPE,
  );
  expect(target).toMatchObject({
    description: { is_spawnable: false, is_summonable: true },
    components: {
      "minecraft:type_family": {
        family: ["yasu_build_tap_target", "inanimate"],
      },
      "minecraft:physics": { has_gravity: false, has_collision: false },
      "minecraft:collision_box": { width: 1, height: 1 },
      "minecraft:interact": {
        interactions: [
          { interact_text: "action.interact.yasu_build.tap_target" },
        ],
      },
    },
  });
  expect(target?.components).not.toHaveProperty("minecraft:persistent");
});

// Bedrock drops all entity properties when a float uses an integer literal.
it("writes float property defaults and ranges with decimal points in every entity", () => {
  let count = 0;
  for (const pack of readdirSync("packs")) {
    const root = join("packs", pack);
    for (const path of packFiles(root).filter(
      (p) => p.startsWith("entities/") && p.endsWith(".json"),
    )) {
      const text = readFileSync(join(root, path), "utf8");
      const entity = JSON.parse(text)["minecraft:entity"];
      for (const [name, definition] of Object.entries<{
        type: string;
        range?: number[];
        default?: number;
      }>(entity?.description?.properties ?? {})) {
        if (definition.type !== "float") continue;
        count++;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const block = text.match(
          new RegExp(`"${escaped}"\\s*:\\s*\\{([^{}]*)\\}`),
        )?.[1];
        expect(block, `${path}: ${name}`).toBeDefined();
        for (const field of ["default", "range"] as const) {
          if (definition[field] === undefined) continue;
          const literal = block?.match(
            new RegExp(`"${field}"\\s*:\\s*(\\[[^\\]]*\\]|-?[0-9.eE+-]+)`),
          )?.[1];
          expect(literal, `${path}: ${name}.${field}`).toBeDefined();
          for (const value of literal?.replace(/[[\]]/g, "").split(",") ?? [])
            expect(value.trim(), `${path}: ${name}.${field}`).toMatch(
              /^-?\d+\.\d+(?:[eE][+-]?\d+)?$/,
            );
        }
      }
    }
  }
  expect(count).toBeGreaterThan(0);
});
