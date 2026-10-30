import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TENT_SPEC } from "../../src/domain/camp/spec";
import { PAINTS, type Paint } from "../../src/domain/shared/paint";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";
import {
  PAINT_BY_DYE,
  PAINT_VARIANT,
  paintEvent,
} from "../../src/infrastructure/shared/dyes";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json")[
  "minecraft:entity"
];
const client = read("packs/yasu_ride_rp/entity/yasu_ride/suv.ce.json")[
  "minecraft:client_entity"
].description;
const controller = read(
  "packs/yasu_ride_rp/render_controllers/yasu_ride/suv.rc.json",
).render_controllers["controller.render.yasu_ride.suv"];

const RP = "packs/yasu_ride_rp";
/** The texture file a painted entity shows for a paint, resolved through its render controller. */
function textureOf(entity: string, paint: Paint): string {
  const ce = read(`${RP}/entity/yasu_ride/${entity}.ce.json`)[
    "minecraft:client_entity"
  ].description;
  const rc = read(`${RP}/render_controllers/yasu_ride/${entity}.rc.json`)
    .render_controllers[`controller.render.yasu_ride.${entity}`];
  const slot: string = rc.arrays.textures["Array.paints"][PAINT_VARIANT[paint]];
  return `${RP}/${ce.textures[slot.replace("Texture.", "")]}.png`;
}

describe("vehicle paints (ADR 0031)", () => {
  it("a new SUV starts at variant 0, its khaki default paint", () => {
    expect(entity.components["minecraft:variant"].value).toBe(
      PAINT_VARIANT.khaki,
    );
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
    for (const paint of PAINTS) {
      const event = entity.events[paintEvent(paint)];
      const [group] = event.add.component_groups;
      expect(
        entity.component_groups[group]["minecraft:variant"].value,
        paint,
      ).toBe(PAINT_VARIANT[paint]);
      expect(new Set([group, ...event.remove.component_groups])).toEqual(
        new Set(PAINTS.map((p) => `yasu_ride:paint_${p}`)),
      );
    }
  });

  it("the render controller picks each paint's texture by its variant, and the texture exists", () => {
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.suv",
      {
        "controller.render.yasu_ride.suv.lit":
          "query.property('yasu_ride:headlights')",
      },
    ]);
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    const slots: string[] = controller.arrays.textures["Array.paints"];
    for (const paint of PAINTS) {
      const key = slots[PAINT_VARIANT[paint]]?.replace("Texture.", "") ?? "";
      const path = client.textures[key];
      expect(path, paint).toMatch(
        paint === "khaki" ? /\/suv$/ : new RegExp(`/suv_${paint}$`),
      );
      expect(existsSync(`packs/yasu_ride_rp/${path}.png`), path).toBe(true);
      expect(existsSync(`${RP}/${path}_mer.png`), path).toBe(true);
      expect(existsSync(`${RP}/${path}.texture_set.json`), path).toBe(true);
    }
  });

  it("each of the 16 vanilla dyes maps to its own paint, and brown dye restores khaki", () => {
    const colors = [
      "white",
      "light_gray",
      "gray",
      "black",
      "brown",
      "red",
      "orange",
      "yellow",
      "lime",
      "green",
      "cyan",
      "light_blue",
      "blue",
      "purple",
      "magenta",
      "pink",
    ];
    expect(Object.keys(PAINT_BY_DYE).sort()).toEqual(
      colors.map((c) => `minecraft:${c}_dye`).sort(),
    );
    expect(Object.values(PAINT_BY_DYE).sort()).toEqual([...PAINTS].sort());
    expect(PAINT_BY_DYE["minecraft:brown_dye"]).toBe("khaki");
  });

  it("khaki, green, and red keep the variants ADR 0017 gave them", () => {
    expect(PAINTS.slice(0, 3)).toEqual(["khaki", "green", "red"]);
  });

  it("each painted entity's default paint matches the texture its variant-0 slot shows (ADR 0076)", () => {
    const painted: { entity: string; defaultPaint: Paint }[] = [
      ...VEHICLE_KINDS.map((kind) => ({
        entity: kind,
        defaultPaint: profileOf(kind).defaultPaint,
      })),
      { entity: "tent", defaultPaint: TENT_SPEC.defaultPaint },
    ];
    for (const { entity, defaultPaint } of painted) {
      for (const paint of PAINTS)
        expect(existsSync(textureOf(entity, paint)), `${entity} ${paint}`).toBe(
          true,
        );
      const base = readFileSync(textureOf(entity, PAINTS[0]));
      const same = PAINTS.slice(1).filter((p) =>
        readFileSync(textureOf(entity, p)).equals(base),
      );
      if (same.length === 0) expect(defaultPaint, entity).toBe(PAINTS[0]);
      else expect(same, entity).toEqual([defaultPaint]);
    }
  });
});

describe("tent paints (ADR 0031, 0135)", () => {
  const tent = read("packs/yasu_ride_bp/entities/yasu_ride/tent.se.json")[
    "minecraft:entity"
  ];
  const tentClient = read(`${RP}/entity/yasu_ride/tent.ce.json`)[
    "minecraft:client_entity"
  ].description;
  const tentController = read(`${RP}/render_controllers/yasu_ride/tent.rc.json`)
    .render_controllers["controller.render.yasu_ride.tent"];

  it("a new tent starts at variant 0", () => {
    expect(tent.components["minecraft:variant"].value).toBe(
      PAINT_VARIANT.khaki,
    );
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
    for (const paint of PAINTS) {
      const event = tent.events[paintEvent(paint)];
      expect(event.add.component_groups).toEqual([`yasu_ride:paint_${paint}`]);
      const [group] = event.add.component_groups;
      expect(
        tent.component_groups[group]["minecraft:variant"].value,
        paint,
      ).toBe(PAINT_VARIANT[paint]);
      expect(event.remove.component_groups).toHaveLength(PAINTS.length - 1);
      expect(new Set([group, ...event.remove.component_groups])).toEqual(
        new Set(PAINTS.map((p) => `yasu_ride:paint_${p}`)),
      );
    }
  });

  it("the render controller picks 16 textures in PAINTS order by the variant", () => {
    expect(tentController.textures).toEqual(["Array.paints[query.variant]"]);
    expect(tentController.arrays.textures["Array.paints"]).toEqual(
      PAINTS.map((p) => `Texture.${p === "khaki" ? "default" : p}`),
    );
  });

  it("every texture path exists, default for khaki and tent_<paint> for the others", () => {
    for (const paint of PAINTS) {
      const key = paint === "khaki" ? "default" : paint;
      const path = tentClient.textures[key];
      expect(path, paint).toBe(
        paint === "khaki"
          ? "textures/entity/yasu_ride/tent"
          : `textures/entity/yasu_ride/tent_${paint}`,
      );
      expect(existsSync(`${RP}/${path}.png`), path).toBe(true);
    }
  });

  it("variant 0's texture matches no other paint's, so the default paint is khaki (ADR 0076)", () => {
    const base = readFileSync(textureOf("tent", PAINTS[0]));
    for (const paint of PAINTS.slice(1))
      expect(readFileSync(textureOf("tent", paint)).equals(base), paint).toBe(
        false,
      );
    expect(TENT_SPEC.defaultPaint).toBe("khaki");
  });
});
