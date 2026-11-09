import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp/";
const RP = "packs/yasu_ride_rp/";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}entities/yasu_ride/beach_parasol.se.json`)[
  "minecraft:entity"
];
const client = read(`${RP}entity/yasu_ride/beach_parasol.ce.json`)[
  "minecraft:client_entity"
].description;
const controller = read(
  `${RP}render_controllers/yasu_ride/beach_parasol.rc.json`,
).render_controllers["controller.render.yasu_ride.beach_parasol"];
type Cube = { uv: Record<string, { uv: number[]; uv_size: number[] }> };
type Bone = { name: string; parent?: string; cubes?: Cube[] };
const geometry = read(`${RP}models/entity/yasu_ride/beach_parasol.geo.json`)[
  "minecraft:geometry"
][0] as { bones: Bone[] };

describe("beach parasol pack assets", () => {
  it("keeps the base stationary, persistent, immune to damage, and independently targetable", () => {
    expect(entity.description).toEqual({
      identifier: "yasu_ride:beach_parasol",
      is_spawnable: false,
      is_summonable: true,
    });
    const c = entity.components;
    expect(c["minecraft:type_family"].family).toEqual([
      "beach_parasol",
      "inanimate",
    ]);
    expect(c["minecraft:persistent"]).toEqual({});
    expect(c["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
    expect(c["minecraft:knockback_resistance"].value).toBe(1);
    expect(c["minecraft:collision_box"]).toEqual({ width: 1.5, height: 0.32 });
    expect(c["minecraft:variant"].value).toBe(PAINTS.indexOf("white"));
  });

  it("selects every paint in the shared variant order and removes the previous paint group", () => {
    const groups = PAINTS.map((paint) => `yasu_ride:paint_${paint}`);
    expect(Object.keys(entity.component_groups)).toEqual(groups);
    expect(Object.keys(entity.events)).toEqual(groups);
    for (const [index, group] of groups.entries()) {
      expect(entity.component_groups[group]).toEqual({
        "minecraft:variant": { value: index },
      });
      expect(entity.events[group]).toEqual({
        add: { component_groups: [group] },
        remove: { component_groups: groups.filter((other) => other !== group) },
      });
    }
    expect(controller.arrays.textures["Array.paints"]).toEqual(
      PAINTS.map((paint) => `Texture.${paint}`),
    );
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    expect(client.geometry.default).toBe("geometry.yasu_ride.beach_parasol");
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.beach_parasol",
    ]);
    for (const paint of PAINTS)
      expect(client.textures[paint]).toBe(
        "textures/entity/yasu_ride/beach_parasol" +
          (paint === "white" ? "" : `_${paint}`),
      );
  });

  it("reserves both fabric slots for the eight canopy panels and fixes all other texels across paints", () => {
    expect(
      geometry.bones
        .filter((b) => b.name.startsWith("panel_"))
        .map((b) => b.name),
    ).toEqual(Array.from({ length: 8 }, (_, i) => `panel_${i}`));
    for (const name of [
      "root",
      "base",
      "post",
      "pole",
      "arm",
      "canopy",
      "ribs",
      "vent",
      "hub",
    ])
      expect(geometry.bones.some((bone) => bone.name === name)).toBe(true);
    for (const bone of geometry.bones) {
      const slots = (bone.cubes ?? []).flatMap((cube) =>
        Object.values(cube.uv).map((face) => {
          expect(face.uv_size).toEqual([16, 16]);
          return (face.uv[0] ?? 0) / 16 + (face.uv[1] ?? 0) / 4;
        }),
      );
      if (bone.name.startsWith("panel_")) {
        expect(bone.parent).toBe("canopy");
        expect(new Set(slots)).toEqual(new Set([0, 1]));
      } else {
        expect(slots.every((slot) => slot >= 2)).toBe(true);
      }
    }
    const reference = readRgbaPng(`${RP + client.textures.white}.png`);
    expect([reference.width, reference.height]).toEqual([64, 64]);
    for (const paint of PAINTS) {
      const { pixels } = readRgbaPng(`${RP + client.textures[paint]}.png`);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const offset = (y * 64 + x) * 4;
          if (y < 16 && x < 32) continue;
          expect(pixels.subarray(offset, offset + 4), paint).toEqual(
            reference.pixels.subarray(offset, offset + 4),
          );
        }
      if (paint !== "white")
        expect(pixels.subarray(0, 4)).not.toEqual(
          reference.pixels.subarray(0, 4),
        );
    }
  });

  it("rejects fabric on the pole and verifies geometry bounds and support cell constants", () => {
    execFileSync("python3", [
      "-I",
      "-c",
      [
        "import copy, math, sys",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        "m = load_tool('gen_beach_parasol')",
        "d = m.geometry()['minecraft:geometry'][0]",
        "m.validate(d['bones'])",
        "bad = copy.deepcopy(d['bones'])",
        "next(b for b in bad if b['name'] == 'pole')['cubes'][0]['uv']['up'] = m.face('fabric_top')",
        "try:",
        "    m.validate(bad)",
        "except ValueError:",
        "    pass",
        "else:",
        "    raise AssertionError('fabric outside canopy was accepted')",
        "def cells(names):",
        "    result = set()",
        "    for b in d['bones']:",
        "        if b['name'] not in names: continue",
        "        for c in b.get('cubes', []):",
        "            pts = m.tilt.corners(c)",
        "            lo = [min(p[i] for p in pts)/16+(0 if i==1 else 0.5) for i in range(3)]",
        "            hi = [max(p[i] for p in pts)/16+(0 if i==1 else 0.5) for i in range(3)]",
        "            ranges = [range(math.floor(lo[i]+0.0001),math.ceil(hi[i]-0.0001)) for i in range(3)]",
        "            for x in ranges[0]:",
        "                for y in ranges[1]:",
        "                    for z in ranges[2]:",
        "                        axes = ((1,0),(0,1))",
        "                        poly = [(pts[n][1],pts[n][2]) for n in (0,2,6,4)]",
        "                        edges = [(poly[(n+1)%4][0]-poly[n][0],poly[(n+1)%4][1]-poly[n][1]) for n in (0,1)]",
        "                        axes += tuple((-v,u) for u,v in edges)",
        "                        rect = [(yy,zz) for yy in (y*16,(y+1)*16) for zz in (z*16-8,z*16+8)]",
        "                        def separates(axis):",
        "                            a = [sum(v*w for v,w in zip(p,axis)) for p in poly]",
        "                            b = [sum(v*w for v,w in zip(p,axis)) for p in rect]",
        "                            return max(a) <= min(b)+0.00001 or max(b) <= min(a)+0.00001",
        "                        if not any(separates(axis) for axis in axes): result.add((x,y,z))",
        "    return result",
        "assert cells(('base',)) == set(m.BASE_CELLS), cells(('base',))",
        "assert cells(('post','pole')) == set(m.POLE_FOOT_CELLS), cells(('post','pole'))",
        "assert all(abs(z + m.BASE_OFFSET) > 2 for x,y,z in (*m.BASE_CELLS,*m.POLE_FOOT_CELLS))",
        "panel = next(b for b in d['bones'] if b['name']=='panel_0')",
        "assert abs(min(p[2] for c in panel['cubes'] for p in m.tilt.corners(c))-(m.CANOPY_Z-40)) < 0.06",
        "assert abs(max(p[1] for b in d['bones'] if b['name'].startswith('vent') for c in b['cubes'] for p in m.tilt.corners(c))/16-m.CANOPY_TOP)<0.001",
        "r = load_tool('render_preview')",
        "turns = r.bone_turns(d['bones'])",
        "desc = d['description']",
        "for b in d['bones']:",
        "    for c in b.get('cubes',[]):",
        "        for p in m.tilt.corners(c):",
        "            for pivot, rotation in turns[b['name']]: p = r.rotate(p, pivot, rotation)",
        "            for i, extent in enumerate((desc['visible_bounds_width'],desc['visible_bounds_height'],desc['visible_bounds_width'])):",
        "                assert abs(p[i]/16-desc['visible_bounds_offset'][i]) <= extent/2 + 0.001",
      ].join("\n"),
    ]);
  });

  it("provides one item, its wool-stick-iron-slab recipe, translations, preview, and icon", () => {
    const item = read(`${BP}items/yasu_ride/beach_parasol_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description).toEqual({
      identifier: "yasu_ride:beach_parasol_item",
      menu_category: { category: "items" },
    });
    expect(item.components["minecraft:max_stack_size"]).toBe(
      read(`${BP}items/yasu_ride/tent_item.item.json`)["minecraft:item"]
        .components["minecraft:max_stack_size"],
    );
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_beach_parasol");
    const recipe = read(
      `${BP}recipes/yasu_ride/beach_parasol_item.recipe.json`,
    )["minecraft:recipe_shaped"];
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.pattern).toEqual(["WWW", " SI", "D I"]);
    expect(recipe.key).toEqual({
      W: { item: "minecraft:white_wool" },
      S: { item: "minecraft:stick" },
      I: { item: "minecraft:iron_ingot" },
      D: { item: "minecraft:stone_block_slab", data: 0 },
    });
    expect(recipe.result).toEqual({
      item: "yasu_ride:beach_parasol_item",
      count: 1,
    });
    expect(
      read(`${RP}textures/item_texture.json`).texture_data
        .yasu_ride_beach_parasol,
    ).toEqual({ textures: "textures/items/yasu_ride/beach_parasol_item" });
    for (const [path, size] of [
      ["docs/images/items/camping-gear/beach_parasol.png", 128],
      [`${RP}textures/items/yasu_ride/beach_parasol_item.png`, 32],
    ] as const) {
      const image = readRgbaPng(path);
      expect([image.width, image.height]).toEqual([size, size]);
      expect(image.pixels[3]).toBe(0);
      expect(
        image.pixels.some((value, index) => index % 4 === 3 && value === 255),
      ).toBe(true);
    }
    for (const [locale, name, group] of [
      ["en_US", "Beach Parasol", "Resort Gear"],
      [
        "ja_JP",
        "\u30d3\u30fc\u30c1\u30d1\u30e9\u30bd\u30eb",
        "\u30ea\u30be\u30fc\u30c8\u7528\u54c1",
      ],
    ]) {
      const lang = readFileSync(`${RP}texts/${locale}.lang`, "utf8");
      expect(lang).toContain(
        `item.yasu_ride:beach_parasol_item.name=${name}\n`,
      );
      expect(lang).toContain(`yasu_ride:resort_gear=${group}\n`);
    }
  });
});
