import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) =>
  JSON.parse(readFileSync(`${RP}/${path}`, "utf8"));

function texels(name: string) {
  const { width, height, pixels } = readRgbaPng(
    `${RP}/textures/entity/yasu_ride/${name}.png`,
  );
  return {
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, i) => [
      ...pixels.subarray(i * 4, i * 4 + 4),
    ]),
  };
}

const suvLampRegions: {
  rect: [number, number, number, number];
  lit: [number, number][];
}[] = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
atlas = load_tool('suv_atlas')
texture = load_tool('suv_texture')
result = []
for name in ('headlight', 'tail_lamp'):
    r = atlas.BLOCKS[name].region
    result.append({'rect': list(r[1:]), 'lit': [[x, y] for y in range(r.y, r.y + r.h) for x in range(r.x, r.x + r.w) if texture.is_lit(x, y)]})
print(json.dumps(result))`,
    ],
    { encoding: "utf8" },
  ),
);
const suvLit = (x: number, y: number) =>
  (y < 4 && [7].includes(Math.floor(x / 4))) ||
  suvLampRegions.some(
    ({ rect: [bx, by, w, h], lit }) =>
      x >= bx &&
      x < bx + w &&
      y >= by &&
      y < by + h &&
      lit.some(([lx, ly]) => lx === x && ly === y),
  );

describe("SUV tail lamp lit texels", () => {
  it("lights exactly the painter's LED, reverse and complete third brake regions", () => {
    const expected: {
      rect: [number, number, number, number];
      lit: number[];
      third: number[];
    } = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
atlas = load_tool('suv_atlas')
tail = load_tool('suv_paint_tail')
expected, third = [], []
for spec in tail.REGIONS:
    r = atlas.region('tail_lamp', spec.name)
    for v in range(r.h):
        for u in range(r.w):
            i = (r.y + v) * atlas.ATLAS.width + r.x + u
            if tail.lit(spec.name, u, v): expected.append(i)
            if spec.name == 'third_brake': third.append(i)
print(json.dumps({'rect': list(atlas.BLOCKS['tail_lamp'].region[1:]), 'lit': sorted(expected), 'third': third}))`,
        ],
        { encoding: "utf8" },
      ),
    );
    const color = texels("suv_lit");
    const mer = texels("suv_lit_mer");
    const [x, y, w, h] = expected.rect;
    const alphaLit: number[] = [];
    const emissiveLit: number[] = [];
    for (let v = y; v < y + h; v++) {
      for (let u = x; u < x + w; u++) {
        const i = v * color.width + u;
        if (color.pixels[i]?.[3] === 0) alphaLit.push(i);
        if (mer.pixels[i]?.[1] === 255) emissiveLit.push(i);
      }
    }
    expect(expected.lit.length).toBeGreaterThan(0);
    expect(expected.third).toHaveLength(12 * 3);
    expect(expected.lit).toEqual(expect.arrayContaining(expected.third));
    expect(alphaLit).toEqual(expected.lit);
    expect(emissiveLit).toEqual(expected.lit);
  });
});

const headlights = "query.property('yasu_ride:headlights')";
const ceiling = "query.property('yasu_ride:ceiling_lights')";
// The slots are the palette columns the generators select by name into
// LIT_SLOTS (tools/gen_*.py). A palette reorder moves them, so update these
// together with the generators.
const kinds = [
  {
    kind: "suv",
    slots: [7],
    regionRule: suvLit,
    bones: { headlights, tail_lights: headlights },
    condition: headlights,
  },
  {
    kind: "sportsboat",
    slots: [14],
    cell: 4,
    bones: { headlights },
    condition: headlights,
  },
  {
    kind: "camper",
    slots: [14, 33, 34, 35],
    cell: 1,
    bones: { headlights, ceiling_lights: ceiling },
    condition: `${headlights} || ${ceiling}`,
  },
  {
    kind: "bulldozer",
    slots: [14, 16],
    cell: 1,
    bones: { headlights, beacon: headlights },
    condition: headlights,
  },
];

describe.each(kinds)(
  "$kind lit textures (ADR 0147)",
  ({ kind, slots, cell, regionRule, bones, condition }) => {
    function expectedColorTexel(pixel: number[], on: boolean) {
      if (on) return [...pixel.slice(0, 3), 0];
      if (kind === "suv" && pixel[3] === 0) return [...pixel.slice(0, 3), 255];
      return pixel;
    }

    it("generates a matching color atlas, maximum-emissive MER mask, and exact texture set", () => {
      const base = texels(kind);
      const lit = texels(`${kind}_lit`);
      const mer = texels(`${kind}_lit_mer`);
      for (const image of [lit, mer])
        expect([image.width, image.height]).toEqual([base.width, base.height]);
      expect(
        read(`textures/entity/yasu_ride/${kind}_lit.texture_set.json`),
      ).toEqual({
        format_version: "1.16.100",
        "minecraft:texture_set": {
          color: `${kind}_lit`,
          metalness_emissive_roughness: `${kind}_lit_mer`,
        },
      });
      for (const [i, pixel] of base.pixels.entries()) {
        const on =
          regionRule?.(i % base.width, Math.floor(i / base.width)) ??
          (Math.floor(i / base.width) < (cell ?? 1) &&
            slots.includes(Math.floor((i % base.width) / (cell ?? 1))));
        expect(lit.pixels[i], `color texel ${i}`).toEqual(
          expectedColorTexel(pixel, on),
        );
        expect(mer.pixels[i], `MER texel ${i}`).toEqual([
          0,
          on ? 255 : 0,
          255,
          255,
        ]);
      }
    });

    it("draws only the switched lamp bones in a separate emissive pass", () => {
      const client = read(`entity/yasu_ride/${kind}.ce.json`)[
        "minecraft:client_entity"
      ].description;
      const id = `controller.render.yasu_ride.${kind}`;
      const controllers = read(
        `render_controllers/yasu_ride/${kind}.rc.json`,
      ).render_controllers;
      expect(client.textures.lit).toBe(`textures/entity/yasu_ride/${kind}_lit`);
      expect(client.materials.lamp).toBe("entity");
      expect(client.materials.lamp_lit).toBe("entity_emissive");
      expect(client.render_controllers.indexOf(id)).toBeGreaterThanOrEqual(0);
      expect(client.render_controllers.indexOf(id)).toBeLessThan(
        client.render_controllers.length - 1,
      );
      expect(client.render_controllers.at(-1)).toEqual({
        [`${id}.lit`]: condition,
      });
      expect(controllers[`${id}.lit`]).toEqual({
        geometry: "Geometry.default",
        materials: [{ "*": "Material.lamp_lit" }],
        textures: ["Texture.lit"],
        part_visibility: [
          { "*": false },
          ...Object.entries(bones).map(([bone, property]) => ({
            [bone]: property,
          })),
        ],
      });
      const geometry = read(`models/entity/yasu_ride/${kind}.geo.json`)[
        "minecraft:geometry"
      ][0];
      for (const [bone, property] of Object.entries(bones)) {
        expect(
          geometry.bones.some((entry: { name: string }) => entry.name === bone),
        ).toBe(true);
        expect(controllers[id].materials).toContainEqual({
          [bone]: "Material.lamp",
        });
        expect(
          controllers[id].part_visibility.filter(
            (entry: Record<string, unknown>) => bone in entry,
          ),
        ).toEqual([{ [bone]: `!${property}` }]);
      }
      expect(controllers[id].arrays.materials).toBeUndefined();
    });
  },
);

it("requires the approved PBR engine version and matching Resource Pack versions", () => {
  const rp = read("manifest.json");
  const bp = JSON.parse(
    readFileSync("packs/yasu_ride_bp/manifest.json", "utf8"),
  );
  expect(rp.capabilities).toEqual(["pbr"]);
  expect(rp.header.min_engine_version).toEqual([1, 21, 120]);
  expect(rp.modules[0].version).toEqual(rp.header.version);
  expect(
    bp.dependencies.find(
      (dependency: { uuid?: string }) => dependency.uuid === rp.header.uuid,
    )?.version,
  ).toEqual(rp.header.version);
});

describe("SUV round headlight glow", () => {
  it("marks exactly the lens circle as full-bright and emissive inside the headlight block", () => {
    const [x0, y0, w, h]: [number, number, number, number] = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
print(json.dumps(list(load_tool('suv_atlas').region('headlight', 'lens')[1:])))`,
        ],
        { encoding: "utf8" },
      ),
    );
    const lit = texels("suv_lit");
    const mer = texels("suv_lit_mer");
    const block = suvLampRegions[0];
    if (!block) throw new Error("Missing headlight block");
    const [bx, by, bw, bh] = block.rect;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const inside =
          x >= x0 &&
          x < x0 + w &&
          y >= y0 &&
          y < y0 + h &&
          (x + 0.5 - x0 - w / 2) ** 2 + (y + 0.5 - y0 - h / 2) ** 2 <=
            (w / 2) ** 2;
        expect(lit.pixels[y * lit.width + x]?.[3]).toBe(inside ? 0 : 255);
        expect(mer.pixels[y * mer.width + x]?.[1]).toBe(inside ? 255 : 0);
      }
    }
  });
});
