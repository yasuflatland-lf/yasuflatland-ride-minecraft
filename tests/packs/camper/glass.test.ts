import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  baseOrigin,
  baseSize,
  bone,
  bones,
  paletteSlots,
  RP,
  readPng,
  swatch,
  swatchUv,
} from "./helpers";

const camperRender = JSON.parse(
  readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
).render_controllers["controller.render.yasu_ride.camper"];
const camperMaterials: Record<string, string> = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
)["minecraft:client_entity"].description.materials;

describe("camper glass (ADR 0091)", () => {
  const glassBones = ["glass", "door_glass"];

  it("draws the model opaque and blends only the glass material", () => {
    expect(camperMaterials).toEqual({
      default: "entity",
      lamp: "entity",
      lamp_lit: "entity_emissive",
      glass: "entity_alphablend",
    });
    const entries: Record<string, string>[] = camperRender.materials;
    expect(entries[0]).toEqual({ "*": "Material.default" });
    const glassEntries = entries.filter((entry) =>
      Object.values(entry).includes("Material.glass"),
    );
    expect(glassEntries).toEqual(
      glassBones.map((name) => ({ [name]: "Material.glass" })),
    );
  });

  it("keeps glass transparent and limits emissive alpha to lamps and glows", () => {
    const { width, pixels } = readPng("textures/entity/yasu_ride/camper");
    const glowSlot = bone("glow_fl").cubes?.[0]?.uv.north?.uv[0];
    for (let i = 0; i < baseSize[0]; i++) {
      const u = baseOrigin[0] + i;
      const alpha = pixels[(baseOrigin[1] * width + u) * 4 + 3];
      if (u === swatchUv("glass")[0]) expect(alpha).toBeLessThan(255);
      else if (u === glowSlot) expect(alpha).toBe(40);
      else if (u === swatchUv("dome")[0] || i >= paletteSlots.length)
        expect(alpha).toBe(0);
      else expect(alpha, `slot ${i}`).toBe(255);
    }
  });

  it("puts every glass cube in a glass bone listed after every opaque bone", () => {
    for (const b of bones) {
      const glassy = (b.cubes ?? []).filter((c) => swatch(c, "glass"));
      if (glassBones.includes(b.name)) {
        expect(b.cubes?.length, b.name).toBeGreaterThan(0);
        expect(glassy).toHaveLength(b.cubes?.length ?? 0);
      } else {
        expect(glassy, b.name).toHaveLength(0);
      }
    }
    expect(bones.slice(-glassBones.length).map((b) => b.name)).toEqual(
      glassBones,
    );
    expect(bone("door_glass").pivot).toEqual(bone("door_entry").pivot);
  });
});

it("keeps the camper atlas separate from the drawer gear atlas", () => {
  expect(camperRender.textures).toEqual(["Texture.default"]);
  expect(camperRender.arrays).toBeUndefined();
  const client = JSON.parse(
    readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
  )["minecraft:client_entity"].description;
  expect(client.textures).toEqual({
    default: "textures/entity/yasu_ride/camper",
    lit: "textures/entity/yasu_ride/camper_lit",
    mirror: "textures/entity/yasu_ride/camper_mirror",
    drawer_items: "textures/blocks/yasu_ride/camping_gear",
  });
});
