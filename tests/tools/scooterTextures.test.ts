import { existsSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { readRgbaPng } from "../support/png";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, sys
sys.path.insert(0, "tools")
from tool_loader import load_tool
t=load_tool("scooter_textures")
a=load_tool("scooter_atlas")
`;
type Region = {
  name: string;
  material: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
let metadata: {
  paints: Record<string, number[]>;
  defaultPaint: string;
  ivory: number[];
  lit: string[];
  regions: Region[];
};
const directory = "packs/yasu_ride_rp/textures/entity/yasu_ride/";
beforeAll(async () => {
  metadata = JSON.parse(
    await python.run(`${setup}
g=load_tool("gen_scooter")
for name in g.AREA_ORDER: load_tool("scooter_"+name).build()
l=a.pack_layout()
print(json.dumps(dict(paints=t.PAINTS,defaultPaint=t.DEFAULT_PAINT,ivory=a.PAINT_IVORY,lit=t.LIT_REGIONS,regions=[dict(name=r.name,material=r.material.value,x=l.origin(r.name)[0],y=l.origin(r.name)[1],width=r.width,height=r.height) for r in l.regions])))
`),
  );
}, 60000);

it("uses the dye order and preserves the ivory default bytes", () => {
  expect(Object.keys(metadata.paints)).toEqual(PAINTS);
  expect(metadata.defaultPaint).toBe("white");
  expect(metadata.paints.khaki).toEqual(metadata.ivory);
  expect(metadata.paints.white).toEqual(metadata.ivory);
  expect(readFileSync(`${directory}scooter.png`)).toEqual(
    readFileSync(`${directory}scooter_white.png`),
  );
});

it("preserves non-paint texels and alpha across every generated paint", () => {
  const base = readRgbaPng(`${directory}scooter.png`);
  const mask = new Uint8Array(base.width * base.height);
  for (const r of metadata.regions.filter((r) => r.material === "paint")) {
    for (let y = r.y; y < r.y + r.height; y++)
      mask.fill(1, y * base.width + r.x, y * base.width + r.x + r.width);
  }
  for (const paint of PAINTS) {
    const name = paint === "khaki" ? "scooter" : `scooter_${paint}`;
    for (const suffix of [".png", "_mer.png", ".texture_set.json"]) {
      const path = `${directory}${name}${suffix}`;
      expect(existsSync(path)).toBe(true);
      expect(path.slice("packs/".length).length).toBeLessThanOrEqual(80);
    }
    const image =
      paint === "khaki" ? base : readRgbaPng(`${directory}${name}.png`);
    expect([image.width, image.height]).toEqual([base.width, base.height]);
    let invalid = 0;
    for (let i = 0; i < mask.length; i++) {
      const p = i * 4;
      if (image.pixels[p + 3] !== base.pixels[p + 3]) invalid++;
      if (
        !mask[i] &&
        !image.pixels.subarray(p, p + 4).equals(base.pixels.subarray(p, p + 4))
      )
        invalid++;
    }
    expect(invalid).toBe(0);
    expect(
      JSON.parse(readFileSync(`${directory}${name}.texture_set.json`, "utf8"))[
        "minecraft:texture_set"
      ],
    ).toEqual({ color: name, metalness_emissive_roughness: `${name}_mer` });
  }
}, 60000);

it("recolours arbitrary channels with the shaded ivory lookup", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...PAINTS),
      fc.tuple(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
      ),
      async (paint, rgba) => {
        await python.run(`${setup}
from types import SimpleNamespace
p=bytes(${JSON.stringify(rgba)})
l=SimpleNamespace(size=(2,1),regions=[SimpleNamespace(name="paint",width=1,height=1,material=a.Material.PAINT)],origin=lambda name:(0,0))
c=t.PAINTS["${paint}"]
result=t.recolor(l,p+p,c)
assert result[4:]==p and result[3]==p[3]
assert result[:3]==bytes(min(255,round(target*old/base)) for target,old,base in zip(c,p,a.PAINT_IVORY))
`);
      },
    ),
    { numRuns: 50 },
  );
});

it("assigns material finishes and lights exactly the lamp rectangles", () => {
  expect(metadata.lit).toEqual([
    "head_lens",
    "lens_head",
    "lens_tail",
    "lens_amber",
  ]);
  const mer = readRgbaPng(`${directory}scooter_mer.png`);
  const lit = readRgbaPng(`${directory}scooter_lit.png`);
  const litMer = readRgbaPng(`${directory}scooter_lit_mer.png`);
  expect([lit.width, lit.height]).toEqual([mer.width, mer.height]);
  expect([litMer.width, litMer.height]).toEqual([mer.width, mer.height]);
  expect(
    JSON.parse(
      readFileSync(`${directory}scooter_lit.texture_set.json`, "utf8"),
    )["minecraft:texture_set"],
  ).toEqual({
    color: "scooter_lit",
    metalness_emissive_roughness: "scooter_lit_mer",
  });
  const mask = new Uint8Array(mer.width * mer.height);
  for (const r of metadata.regions) {
    const p = (r.y * mer.width + r.x) * 4;
    if (r.material === "chrome") {
      expect(mer.pixels[p]).toBeGreaterThan(200);
      expect(mer.pixels[p + 2]).toBeLessThan(90);
    }
    if (r.material === "paint") {
      expect(mer.pixels[p]).toBe(0);
      expect(mer.pixels[p + 2]).toBe(90);
    }
    if (r.material === "rubber") expect(mer.pixels[p + 2]).toBeGreaterThan(220);
    if (metadata.lit.includes(r.name))
      for (let y = r.y; y < r.y + r.height; y++)
        mask.fill(1, y * mer.width + r.x, y * mer.width + r.x + r.width);
  }
  let invalid = 0;
  for (let i = 0; i < mask.length; i++) {
    if (
      lit.pixels[i * 4 + 3] !== (mask[i] ? 0 : 255) ||
      litMer.pixels[i * 4 + 1] !== (mask[i] ? 255 : 0)
    )
      invalid++;
  }
  expect(invalid).toBe(0);
  const icon = readRgbaPng(
    "packs/yasu_ride_rp/textures/items/yasu_ride/scooter_item.png",
  );
  expect([icon.width, icon.height]).toEqual([16, 16]);
  const alpha = icon.pixels.filter((_, i) => i % 4 === 3);
  expect(alpha.includes(0)).toBe(true);
  expect(alpha.includes(255)).toBe(true);
});
