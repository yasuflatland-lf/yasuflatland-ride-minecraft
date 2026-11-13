import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geometry, RP, readPng, swatchUv } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("retains the saved variant and only a normalization event", () => {
    const entity = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/entities/yasu_ride/camper.se.json",
        "utf8",
      ),
    )["minecraft:entity"];
    expect(entity.components["minecraft:variant"]).toEqual({ value: 0 });
    for (const entries of [entity.component_groups, entity.events]) {
      expect(
        Object.keys(entries).filter((key) =>
          key.startsWith("yasu_ride:paint_"),
        ),
      ).toEqual([]);
    }
    const event = entity.events["yasu_ride:normalize_paint"];
    expect(event).toEqual({
      add: { component_groups: ["yasu_ride:normalized_paint"] },
    });
    expect(entity.component_groups["yasu_ride:normalized_paint"]).toEqual({
      "minecraft:variant": { value: 0 },
    });
  });

  it("generates exactly one colour atlas and no per-paint files", () => {
    const files = readdirSync(`${RP}/textures/entity/yasu_ride`).filter(
      (name) =>
        /^camper(?:_\w+)?\.png$/.test(name) &&
        !name.startsWith("camper_lit") &&
        !name.startsWith("camper_mirror") &&
        name !== "camper_interior_mer.png",
    );
    expect(files).toEqual(["camper.png"]);
    const khaki = readPng("textures/entity/yasu_ride/camper");
    expect([khaki.width, khaki.height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    const [u, v] = swatchUv("khaki");
    const offset = (v * khaki.width + u) * 4;
    expect([...khaki.pixels.subarray(offset, offset + 4)]).toEqual([
      150, 128, 72, 255,
    ]);
  });
});
