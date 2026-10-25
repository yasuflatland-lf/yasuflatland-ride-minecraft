import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bp = "packs/yasu_ride_bp";
const rp = "packs/yasu_ride_rp";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("camp table", () => {
  it("has two adjacent seats facing the same side of the unchanged table", () => {
    const entity = readJson(`${bp}/entities/yasu_ride/camp_table.se.json`)[
      "minecraft:entity"
    ];
    const rideable = entity.components["minecraft:rideable"];
    expect(rideable.seat_count).toBe(2);
    expect(rideable.family_types).toEqual(["player"]);
    expect(rideable.interact_text).toBe("action.interact.yasu_ride.sit");
    expect(rideable.seats).toHaveLength(2);
    const [a, b] = rideable.seats.map(
      (seat: { position: number[] }) => seat.position,
    );
    expect(a[0]).toBeLessThan(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
    expect((b[0] - a[0]) * 16).toBeGreaterThanOrEqual(12);
    expect(entity.components["minecraft:physics"].has_gravity).toBe(true);
  });

  it("connects the item, entity model, wood texture, and preview", () => {
    const client = readJson(`${rp}/entity/yasu_ride/camp_table.ce.json`)[
      "minecraft:client_entity"
    ].description;
    const geometry = readJson(
      `${rp}/models/entity/yasu_ride/camp_table.geo.json`,
    )["minecraft:geometry"][0];
    expect(client.geometry.default).toBe(geometry.description.identifier);
    const tabletop = geometry.bones[0].cubes[0];
    expect(tabletop.size[0]).toBeGreaterThanOrEqual(2 * 12 + 4);
    expect(existsSync(`${rp}/${client.textures.default}.png`)).toBe(true);
    expect(existsSync("docs/images/items/camping-gear/camp_table.png")).toBe(
      true,
    );
    const item = readJson(`${bp}/items/yasu_ride/camp_table_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe("yasu_ride:camp_table_item");
    const atlas = readJson(`${rp}/textures/item_texture.json`).texture_data;
    expect(atlas[item.components["minecraft:icon"]].textures).toBe(
      "textures/items/yasu_ride/camp_table_item",
    );
  });
});
