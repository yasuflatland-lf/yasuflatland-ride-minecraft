import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bone,
  bones,
  paletteSlots,
  RP,
  readPng,
  swatch,
  swatchCell,
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
      cutout: "entity_alphatest",
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
    for (const name of paletteSlots) {
      const [u, v, cell] = swatchCell(name);
      for (let y = v; y < v + cell; y++) {
        for (let x = u; x < u + cell; x++) {
          const alpha = pixels[(y * width + x) * 4 + 3];
          if (name === "glass") expect(alpha).toBeLessThan(255);
          else if (name === "glow") expect(alpha).toBe(40);
          else if (name === "dome") expect(alpha).toBe(0);
          else expect(alpha, name).toBe(255);
        }
      }
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
