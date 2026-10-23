import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";

it.each(VEHICLE_KINDS)(
  "matches the %s body height to its base collision box",
  (kind) => {
    const entity = JSON.parse(
      readFileSync(
        `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
        "utf8",
      ),
    )["minecraft:entity"];
    expect(profileOf(kind).body.height).toBe(
      entity.components["minecraft:collision_box"].height,
    );
  },
);
