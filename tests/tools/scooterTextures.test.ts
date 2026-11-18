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
print(json.dumps(dict(paints=t.PAINTS,defaultPaint=t.DEFAULT_PAINT,ivory=a.PAINT_IVORY,lit=t.LIT_REGIONS,regions=[dict(name=r.name,material=r.material.value,x=l.placement(r.name).x,y=l.placement(r.name).y,width=r.width,height=r.height) for r in l.regions])))
`),
  );
}, 60000);

it("uses the dye order and preserves the ivory default bytes", async () => {
  expect(Object.keys(metadata.paints)).toEqual(PAINTS);
  expect(metadata.defaultPaint).toBe("white");
  expect(metadata.paints.khaki).toEqual(metadata.ivory);
  expect(metadata.paints.white).toEqual(metadata.ivory);
  await python.run(`${setup}
l=a.pack_layout()
assert t.recolor(l,a.render_atlas(l),t.PAINTS["white"]) == a.render_atlas(l)
`);
});

it("preserves non-paint texels and alpha across every generated paint", () => {
  const base = readRgbaPng(`${directory}scooter.png`);
  const mask = new Uint8Array(base.width * base.height);
  const slots = new Set<string>();
  for (const r of metadata.regions.filter((r) => r.material === "paint")) {
    const slot = `${r.x},${r.y},${r.width},${r.height}`;
    if (slots.has(slot)) continue;
    slots.add(slot);
    for (let y = r.y; y < r.y + r.height; y++)
      mask.fill(1, y * base.width + r.x, y * base.width + r.x + r.width);
  }
  for (const paint of PAINTS) {
    const name =
      paint === "khaki" || paint === "white" ? "scooter" : `scooter_${paint}`;
    for (const suffix of [".png", ".texture_set.json"]) {
      const path = `${directory}${name}${suffix}`;
      expect(existsSync(path)).toBe(true);
      expect(path.slice("packs/".length).length).toBeLessThanOrEqual(80);
    }
    const image =
      paint === "khaki" ? base : readRgbaPng(`${directory}${name}.png`);
    expect([image.width, image.height]).toEqual([base.width, base.height]);
    const color = metadata.paints[paint] ?? [];
    const tables = color.map((target, channel) =>
      Array.from({ length: 256 }, (_, old) => {
        const value = (target * old) / (metadata.ivory[channel] ?? 1);
        const lower = Math.floor(value);
        const rounded =
          value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
        return Math.min(255, rounded);
      }),
    );
    let invalid = 0;
    for (let i = 0; i < mask.length; i++) {
      const p = i * 4;
      if (image.pixels[p + 3] !== base.pixels[p + 3]) invalid++;
      if (mask[i])
        for (let channel = 0; channel < 3; channel++)
          if (
            image.pixels[p + channel] !==
            tables[channel]?.[base.pixels[p + channel] ?? 0]
          )
            invalid++;
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
    ).toEqual({ color: name, metalness_emissive_roughness: "scooter_mer" });
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
l=SimpleNamespace(size=(2,1),regions=[SimpleNamespace(name="paint",width=1,height=1,material=a.Material.PAINT)],placement=lambda name:SimpleNamespace(x=0,y=0))
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

it("assigns material finishes and lights exactly the opaque lamp texels", () => {
  expect(metadata.lit).toEqual([
    "head_lens",
    "lens_head",
    "lens_tail_glow",
    "lens_amber",
    "glow",
  ]);
  const mer = readRgbaPng(`${directory}scooter_mer.png`);
  const base = readRgbaPng(`${directory}scooter.png`);
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
        for (let x = r.x; x < r.x + r.width; x++)
          // The clear corners of a round lens must not glow as a square plate.
          if (base.pixels[(y * mer.width + x) * 4 + 3] !== 0)
            mask[y * mer.width + x] = 1;
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

it("reduces scooter storage by a quarter of the original atlas area", () => {
  const image = readRgbaPng(`${directory}scooter.png`);
  // The unshared atlas occupied 2048 x 1951 texels; sharing whole regions
  // alone reached only 2048 x 1920, because mirrored panels sit inside sheets.
  expect([image.width, image.height]).toEqual([1754, 1696]);
  expect(image.width * image.height).toBeLessThan(0.75 * 2048 * 1951);
});

it("stores mirrored panel tiles once inside the scooter sheets", async () => {
  const sheets = JSON.parse(
    await python.run(`${setup}
b=load_tool("scooter_body")
s=load_tool("scooter_shield")
h=load_tool("scooter_head")
e=load_tool("scooter_engine")
shares={}
for sheet,*_,share in b._prepared()[4]:
    shares.setdefault(sheet,[]).append(share)
shares["shield_panels"]=s._prepared()[4]
shares["head_panels"]=h._panel_sheet()[1]
for name,*_ in e._surfaces():
    shares[name]=e._surface_masks(name)[1]
print(json.dumps({name:[len(values),len({v.slot for v in values})] for name,values in shares.items()}))
`),
  );
  // [tiles, stored tiles] per sheet; left-right pairs dominate the savings.
  expect(sheets).toEqual({
    body_panels: [661, 434],
    body_cowl_right: [179, 179],
    shield_panels: [510, 362],
    head_panels: [276, 135],
    engine_cast_patch: [42, 33],
    engine_fan_patch: [32, 8],
    engine_pan_patch: [90, 80],
    engine_seam_patch: [18, 12],
    engine_header_patch: [60, 60],
    engine_joint_patch: [6, 2],
    engine_outlet_patch: [6, 2],
  });
}, 60000);

it("shares storage only within matching finishes and lit membership", () => {
  const slots = new Map<string, string>();
  for (const region of metadata.regions) {
    const slot = `${region.x},${region.y},${region.width},${region.height}`;
    const key = `${region.material},${metadata.lit.includes(region.name)}`;
    expect(slots.get(slot) ?? key).toBe(key);
    slots.set(slot, key);
  }
  expect(slots.size).toBeLessThan(metadata.regions.length);
});

it("keeps capped preview samples unchanged when atlas regions move", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 256, max: 1900 }), async (origin) => {
      await python.run(`${setup}
p=load_tool("render_preview")
quad=[(0,0,0),(1,0,0),(1,1,0),(0,1,0)]
def patches(origin):
    texture=[[(v-origin,0,0,255)] for v in range(origin+48)]
    return list(p.textured_face(texture,{'uv':[0,origin],'uv_size':[1,48]},quad,'south',1,len(texture),merge=True,cells_per_unit=6))
assert patches(${origin})==patches(1)
`);
    }),
    { numRuns: 20 },
  );
});

it("keeps capped samples on their original texels under mirrored storage", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), fc.boolean(), async (flipX, flipY) => {
      await python.run(`${setup}
p=load_tool("render_preview")
r=load_tool("region_atlas")
fx,fy=${flipX ? "True" : "False"},${flipY ? "True" : "False"}
texture=[[(u,v,0,255) for u in range(8)] for v in range(8)]
mirrored=[list(reversed(row)) if fx else row for row in (reversed(texture) if fy else texture)]
quad=[(0,0,0),(1,0,0),(1,1,0),(0,1,0)]
for local in (r.UvRect(0,0,8,8),r.UvRect(8,8,-8,-8)):
    before={}
    local.apply(before)
    after={}
    local.to_atlas(r.Placement(0,0,fx,fy),8,8).apply(after)
    after=p.SampledUv(after,r.Placement(0,0,fx,fy))
    assert list(p.textured_face(texture,before,quad,'south',8,8,merge=True,cells_per_unit=3))==list(p.textured_face(mirrored,after,quad,'south',8,8,merge=True,cells_per_unit=3))
`);
    }),
    { numRuns: 10 },
  );
});

it("writes distinct paint colours and exactly one paint MER without white aliases", async () => {
  await python.run(`${setup}
from pathlib import Path
from tempfile import TemporaryDirectory
l=a.pack_layout()
with TemporaryDirectory() as temporary:
    root = Path(temporary)
    t.write(load_tool("texture_io").Outputs(False),root,l,a.render_atlas(l))
    directory = root / "textures/entity/yasu_ride"
    colours = sorted(p for p in directory.glob("scooter*.png")
                     if not p.stem.endswith("_mer") and p.stem != "scooter_lit")
    assert len(colours) == 15
    assert len({p.read_bytes() for p in colours}) == len(colours)
    assert sorted(p.name for p in directory.glob("*_mer.png")
                  if p.stem != "scooter_lit_mer") == ["scooter_mer.png"]
    assert not list(directory.glob("scooter_white*"))
    for colour in colours:
        texture_set = json.loads(colour.with_suffix(".texture_set.json").read_text())["minecraft:texture_set"]
        assert texture_set == dict(color=colour.stem,metalness_emissive_roughness="scooter_mer")
`);
}, 60000);
