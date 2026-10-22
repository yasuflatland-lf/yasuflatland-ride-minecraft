import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SEAT_FILLER_FAMILY,
  SEAT_FILLER_TYPE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const entityFile = read(`${BP}/entities/yasu_ride/seat_filler.se.json`);
const entity = entityFile["minecraft:entity"];

function langValues(locale: string, key: string): string[] {
  return readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${key}=`))
    .map((line) => line.slice(line.indexOf("=") + 1));
}

describe("Seat filler (ADR 0120)", () => {
  it("is summonable but not spawnable, in its own family and skipped by the ram", () => {
    expect(entityFile.format_version).toBe("1.21.80");
    expect(entity.description).toEqual({
      identifier: SEAT_FILLER_TYPE,
      is_spawnable: false,
      is_summonable: true,
    });
    expect(entity.components["minecraft:type_family"]).toEqual({
      family: [SEAT_FILLER_FAMILY, "inanimate"],
    });
  });

  it("only holds a seat: no seat of its own, a tiny box, no gravity, collision, pushing, or damage", () => {
    expect(entity.components["minecraft:rideable"]).toBeUndefined();
    expect(entity.components["minecraft:collision_box"]).toEqual({
      width: 0.1,
      height: 0.1,
    });
    expect(entity.components["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    expect(entity.components["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(entity.components["minecraft:damage_sensor"]).toEqual({
      triggers: { cause: "all", deals_damage: "no" },
    });
  });

  it("is drawn with the deck seat's model, which has no cubes", () => {
    const clientFile = read(`${RP}/entity/yasu_ride/seat_filler.ce.json`);
    const client = clientFile["minecraft:client_entity"].description;
    expect(clientFile.format_version).toBe("1.10.0");
    expect(client.identifier).toBe(SEAT_FILLER_TYPE);
    expect(existsSync(`${RP}/${client.textures.default}.png`)).toBe(true);
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.deck_seat",
    });
    expect(client.render_controllers).toEqual(["controller.render.default"]);
  });

  it.each(["en_US", "ja_JP"])("names the entity in %s", (locale) => {
    const names = langValues(locale, `entity.${SEAT_FILLER_TYPE}.name`);
    expect(names).toHaveLength(1);
    expect(names[0]?.trim()).not.toBe("");
  });
});
