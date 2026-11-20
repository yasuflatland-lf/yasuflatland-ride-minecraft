import { expect, it } from "vitest";
import { type Json, jsonFileEntries } from "../support/packFiles";

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
