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
g=load_tool("gen_scooter")
`;
// A full scooter build takes about 8 s; the worker keeps one interpreter, so
// builtins carries the build from beforeAll to the tests (each run gets fresh globals).
const built = `${setup}
import builtins
if not hasattr(builtins, "scooter_build"):
    builtins.scooter_build=g.build()
geo,l,pixels,lit_geo,ll,lp=builtins.scooter_build
`;
type Region = {
  name: string;
  material: string;
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
};
let metadata: {
  paints: Record<string, number[]>;
  defaultPaint: string;
  ivory: number[];
  lit: string[];
  regions: Region[];
  litRegions: Region[];
  litSize: number[];
};
const directory = "packs/yasu_ride_rp/textures/entity/yasu_ride/";
beforeAll(async () => {
  metadata = JSON.parse(
    await python.run(`${built}
print(json.dumps(dict(paints=t.PAINTS,defaultPaint=t.DEFAULT_PAINT,ivory=a.PAINT_IVORY,lit=t.LIT_REGIONS,litSize=ll.size,litRegions=[dict(name=r.name,material=r.material.value,x=ll.placement(r.name).x,y=ll.placement(r.name).y,flipX=ll.placement(r.name).flip_x,flipY=ll.placement(r.name).flip_y,width=r.width,height=r.height) for r in ll.regions],regions=[dict(name=r.name,material=r.material.value,x=l.placement(r.name).x,y=l.placement(r.name).y,flipX=l.placement(r.name).flip_x,flipY=l.placement(r.name).flip_y,width=r.width,height=r.height) for r in l.regions])))
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
  expect([lit.width, lit.height]).toEqual(metadata.litSize);
  expect([litMer.width, litMer.height]).toEqual(metadata.litSize);
  expect(
    JSON.parse(
      readFileSync(`${directory}scooter_lit.texture_set.json`, "utf8"),
    )["minecraft:texture_set"],
  ).toEqual({
    color: "scooter_lit",
    metalness_emissive_roughness: "scooter_lit_mer",
  });
  const mask = new Uint8Array(lit.width * lit.height);
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
  }
  for (const r of metadata.litRegions) {
    if (!metadata.lit.includes(r.name)) continue;
    const original = metadata.regions.find((region) => region.name === r.name);
    expect(original).toBeDefined();
    if (!original) throw new Error(r.name);
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++)
        if (
          base.pixels[
            ((original.y + (original.flipY ? r.height - 1 - y : y)) *
              base.width +
              original.x +
              (original.flipX ? r.width - 1 - x : x)) *
              4 +
              3
          ] !== 0
        )
          mask[(r.y + y) * lit.width + r.x + x] = 1;
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
p=a.render_atlas(l)
with TemporaryDirectory() as temporary:
    root = Path(temporary)
    t.write(load_tool("texture_io").Outputs(False),root,l,p,l,p)
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

it("preserves every lit face texel in an audited compact atlas", async () => {
  await python.run(`${built}
import math
assert a.audit(ll, lp) == []
assert {r.name for r in ll.regions} == {name for name, face in ll._faces}
assert len(lp) < len(pixels) / 20
count = 0
for base_bone, lit_bone in zip(geo["minecraft:geometry"][0]["bones"], lit_geo["minecraft:geometry"][0]["bones"]):
    for base_cube, lit_cube in zip(base_bone["cubes"], lit_bone["cubes"]):
        for name, face in lit_cube["uv"].items():
            original = base_cube["uv"][name]
            assert list(map(abs, face["uv_size"])) == list(map(abs, original["uv_size"]))
            u,v = face["uv"]
            ou,ov = original["uv"]
            du,dv = face["uv_size"]
            odu,odv = original["uv_size"]
            for y in range(math.floor(min(v,v+dv)), math.ceil(max(v,v+dv))):
                for x in range(math.floor(min(u,u+du)), math.ceil(max(u,u+du))):
                    source = (math.floor(ov+(y+0.5-v)*odv/dv)*l.size[0]+math.floor(ou+(x+0.5-u)*odu/du))*4
                    target = (y*ll.size[0]+x)*4
                    assert lp[target:target+4] == pixels[source:source+4]
            count += 1
assert count == len(ll._faces) and count > 0
`);
}, 60000);

it("relocates signed local rectangles without changing their sampled region texels", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 0, max: 50 }),
      fc.integer({ min: 0, max: 50 }),
      fc.boolean(),
      fc.boolean(),
      fc.tuple(
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 19 }),
      ),
      async (width, height, x, y, flipX, flipY, rect) => {
        const u = rect[0] % width;
        const v = rect[1] % height;
        const w = 1 + (rect[2] % (width - u));
        const h = 1 + (rect[3] % (height - v));
        await python.run(`${setup}
r = load_tool("region_atlas")
region = r.Region("test", ${width}, ${height}, a.Material.LENS, lambda u,v: (u,v,0,255))
local = r.UvRect(${flipX ? u + w : u}, ${flipY ? v + h : v}, ${flipX ? -w : w}, ${flipY ? -h : h})
layouts = [r.Layout([region], (${width + 51},${height + 51}), {"test": r.Placement(px,py)}) for px,py in [(0,0),(${x},${y})]]
faces = []
for layout in layouts:
    face = {}
    g.relocate_face(local, region, layout, face)
    faces.append(face)
    rendered = r.render_atlas(layout)
    assert r.audit(layout, rendered) == []
    px,py = layout.origin(region.name)
    for v in range(${v}, ${v + h}):
        for u in range(${u}, ${u + w}):
            offset = ((py+v)*layout.size[0]+px+u)*4
            assert rendered[offset:offset+4] == bytes(region.pixel(u,v))
assert faces[1]["uv"] == [faces[0]["uv"][0]+${x}, faces[0]["uv"][1]+${y}]
assert faces[0]["uv_size"] == faces[1]["uv_size"]
`);
      },
    ),
    { numRuns: 20 },
  );
});
