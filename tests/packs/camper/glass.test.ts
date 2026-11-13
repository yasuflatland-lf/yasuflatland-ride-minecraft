import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../../src/domain/shared/paint";
import { bone, bones, type Cube, RP, readPng } from "./helpers";

const camperRender = JSON.parse(
  readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
).render_controllers["controller.render.yasu_ride.camper"];
const camperMaterials: Record<string, string> = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
)["minecraft:client_entity"].description.materials;

describe("camper glass (ADR 0091)", () => {
  const glassBones = ["glass", "door_glass"];
  // The PALETTE order in tools/gen_camper.py puts glass in slot 13 and the ceiling light
  // lenses, whose alpha 0 lights them under the emissive material, last (ADR 0115).
  const glassSlot = 13;
  const domeSlot = 33;
  const slotOf = (cube: Cube) => cube.uv.north?.uv[0];

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

  it("keeps glass transparent and limits emissive alpha to lamps and glows in every paint", () => {
    for (const paint of PAINTS) {
      const name = paint === PAINTS[0] ? "camper" : `camper_${paint}`;
      const { width, pixels } = readPng(`textures/entity/yasu_ride/${name}`);
      const glowSlot = bone("glow_fl").cubes?.[0]?.uv.north?.uv[0];
      for (let i = 0; i < width; i++) {
        const alpha = pixels[i * 4 + 3];
        if (i === glassSlot) expect(alpha, paint).toBeLessThan(255);
        else if (i === glowSlot) expect(alpha, paint).toBe(40);
        else if (i === domeSlot || i >= 39) expect(alpha, paint).toBe(0);
        else expect(alpha, `${paint} slot ${i}`).toBe(255);
      }
    }
  });

  it("puts every glass cube in a glass bone listed after every opaque bone", () => {
    for (const b of bones) {
      const glassy = (b.cubes ?? []).filter((c) => slotOf(c) === glassSlot);
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

it("lists every paint in the camper render controller", () => {
  const controller = JSON.parse(
    readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
  ).render_controllers["controller.render.yasu_ride.camper"];
  expect(controller.arrays.textures["Array.paints"]).toHaveLength(
    PAINTS.length,
  );
});
