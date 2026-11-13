import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLEEP_MESSAGES } from "../../../src/domain/shared/sleep";
import { DECOR_MESSAGES } from "../../../src/domain/vehicle/dock/decorMessages";
import { HINTS } from "../../../src/domain/vehicle/hints";
import { CAMPER_DOOR_COMPONENT } from "../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { bones, RP } from "./helpers";

const camperEntity = JSON.parse(
  readFileSync("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json", "utf8"),
)["minecraft:entity"];
describe("camper parking assets (ADR 0068)", () => {
  it("keeps the 3 x 4 collision box in the base components", () => {
    // Taps never reach custom_hit_test without a base collision box (ADR 0068).
    expect(camperEntity.components["minecraft:collision_box"]).toEqual({
      width: 3,
      height: 4,
    });
  });

  it("switches collision and gravity groups when parking and departing", () => {
    expect(camperEntity.component_groups["yasu_ride:undocked"]).toEqual({
      "minecraft:collision_box": { width: 3, height: 4 },
    });
    expect(camperEntity.component_groups["yasu_ride:docked"]).toEqual({
      "minecraft:physics": { has_collision: false, has_gravity: false },
      "minecraft:collision_box": { width: 0.4, height: 0.4 },
    });
    expect(camperEntity.events["minecraft:entity_spawned"]).toEqual({
      add: { component_groups: ["yasu_ride:undocked"] },
    });
    expect(camperEntity.events["yasu_ride:dock"]).toEqual({
      remove: {
        component_groups: ["yasu_ride:weighted", "yasu_ride:undocked"],
      },
      add: { component_groups: ["yasu_ride:docked"] },
    });
    expect(camperEntity.events["yasu_ride:undock"]).toEqual({
      remove: { component_groups: ["yasu_ride:docked"] },
      add: { component_groups: ["yasu_ride:weighted", "yasu_ride:undocked"] },
    });
  });

  it("registers the door component and rotates only the model's entry door", () => {
    const door = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/blocks/yasu_ride/camper_door.block.json",
        "utf8",
      ),
    )["minecraft:block"];
    expect(door.components["minecraft:custom_components"]).toEqual([
      CAMPER_DOOR_COMPONENT,
    ]);
    expect(camperClient.animations.door).toBe(
      "animation.yasu_ride.camper.door",
    );
    expect(camperClient.scripts.animate).toContain("door");
    const animation = camperAnimations["animation.yasu_ride.camper.door"];
    expect(animation?.loop).toBe(true);
    expect(animation?.bones).toEqual({
      door_entry: { rotation: [0, "q.property('yasu_ride:door') * -100", 0] },
    });
    expect(bones.map((b) => b.name)).toContain("door_entry");
  });

  it.each(["en_US", "ja_JP"])(
    "translates parking and cargo messages in %s",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of ["cannot_park", "clear_cargo"])
        expect(lang).toMatch(
          new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
        );
    },
  );

  it.each(["en_US", "ja_JP"])("translates the bed message in %s", (locale) => {
    const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
    for (const name of Object.values(SLEEP_MESSAGES))
      expect(lang).toMatch(
        new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
      );
  });

  it.each(["en_US", "ja_JP"])(
    "translates the decor message in %s",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of Object.values(DECOR_MESSAGES))
        expect(lang).toMatch(
          new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
        );
    },
  );

  it.each(["en_US", "ja_JP"])(
    "translates every hint in %s, with the hit count and the vehicle name in the bumper hints and the vehicle name in the paint hint",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of Object.values(HINTS)) {
        const line = lang.match(
          new RegExp(`^yasu_ride\\.hint\\.${name}=(.+)$`, "m"),
        );
        expect(line, name).not.toBeNull();
        const args = line?.[1]?.match(/%s/g)?.length ?? 0;
        expect(args, name).toBe(
          name.startsWith("bumper_") ? 2 : name === HINTS.paint ? 1 : 0,
        );
      }
    },
  );
});

const camperClient = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
)["minecraft:client_entity"].description;
const camperAnimations = JSON.parse(
  readFileSync(`${RP}/animations/yasu_ride/camper.anim.json`, "utf8"),
).animations;
