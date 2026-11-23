import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCOOTER_PROFILE } from "../../src/domain/vehicle/kinds/scooter/profile";
import { PAINT_VARIANT } from "../../src/infrastructure/shared/dyes";
import { type Bone, turnedCorners } from "../support/geometry";
import { loadScooterGeo } from "../tools/helpers/scooterGeo";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const pixelsPerBlock = 16;
const fullGeometry = loadScooterGeo();

describe("scooter Behavior Pack geometry", () => {
  const entity = () =>
    read("packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json")[
      "minecraft:entity"
    ];
  const geometry = () => fullGeometry;

  it("fits the collision box inside the placement clearance and matches body height", () => {
    const box = entity().components["minecraft:collision_box"];
    const { halfX, halfZ, height } = SCOOTER_PROFILE.placement.clearance;
    expect(box.height).toBe(SCOOTER_PROFILE.body.height);
    expect(box.width / 2).toBe(SCOOTER_PROFILE.body.halfWidth);
    expect(box.height).toBeLessThanOrEqual(height);
    expect(box.width / 2).toBeLessThanOrEqual(halfX + 0.5);
    expect(box.width / 2).toBeLessThanOrEqual(halfZ + 0.5);
  });

  it("covers the collision box and every rotated model corner with its footprint", () => {
    const box = entity().components["minecraft:collision_box"];
    expect(Math.hypot(box.width / 2, box.width / 2)).toBeLessThanOrEqual(
      SCOOTER_PROFILE.footprint,
    );
    for (const bone of geometry().bones as Bone[]) {
      for (const cube of bone.cubes ?? []) {
        for (const [x, , z] of turnedCorners(bone, cube)) {
          expect(Math.hypot(x, z) / pixelsPerBlock).toBeLessThanOrEqual(
            SCOOTER_PROFILE.footprint,
          );
        }
      }
    }
  });
  it("switches gravity off for flight and restores it without conflicting groups", () => {
    const { components, component_groups: groups, events } = entity();
    expect(components["minecraft:physics"]).toEqual({});
    expect(groups["yasu_ride:weightless"]).toEqual({
      "minecraft:physics": { has_gravity: false },
    });
    expect(groups["yasu_ride:weighted"]).toEqual({ "minecraft:physics": {} });
    for (const [event, added, removed] of [
      ["gravity_off", "weightless", "weighted"],
      ["gravity_on", "weighted", "weightless"],
    ]) {
      expect(events[`yasu_ride:${event}`]).toEqual({
        add: { component_groups: [`yasu_ride:${added}`] },
        remove: { component_groups: [`yasu_ride:${removed}`] },
      });
    }
  });

  it("starts in road form with wheels down and synchronizes the visual defaults", () => {
    const properties = entity().description.properties;
    const defaults = {
      form: "car",
      bank: 0,
      gear_down: true,
      headlights: false,
      lean: 0,
      steer: 0,
      stand: false,
    };
    for (const [name, value] of Object.entries(defaults)) {
      expect(properties[`yasu_ride:${name}`]).toMatchObject({
        default: value,
        client_sync: true,
      });
    }
  });

  it("starts with the white variant", () => {
    const { components } = entity();
    expect(components["minecraft:variant"].value).toBe(PAINT_VARIANT.white);
  });

  it("defines a named single-stack scooter item with its registered icon", () => {
    const item = read(
      "packs/yasu_ride_bp/items/yasu_ride/scooter_item.item.json",
    )["minecraft:item"];
    expect(item.description.identifier).toBe("yasu_ride:scooter_item");
    expect(item.components["minecraft:max_stack_size"]).toBe(1);
    expect(item.components["minecraft:display_name"].value).toBe(
      "item.yasu_ride:scooter_item.name",
    );
    const icons = read("tools/item_texture_base.json").texture_data;
    expect(icons[item.components["minecraft:icon"]].textures).toBe(
      "textures/items/yasu_ride/scooter_item",
    );
  });
});

describe("scooter entity properties", () => {
  it("writes float property defaults with a decimal point", () => {
    // The engine rejects an integer literal as the default of a float property.
    const text = readFileSync(
      "packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json",
      "utf8",
    );
    const properties = read(
      "packs/yasu_ride_bp/entities/yasu_ride/scooter.se.json",
    )["minecraft:entity"].description.properties;
    for (const [name, def] of Object.entries<{ type: string }>(properties)) {
      if (def.type !== "float") continue;
      const block = text.slice(text.indexOf(`"${name}"`));
      expect(block.match(/"default":\s*(-?[\d.]+)/)?.[1]).toContain(".");
    }
  });
});
