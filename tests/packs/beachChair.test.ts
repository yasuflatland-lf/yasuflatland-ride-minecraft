import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEACH_CHAIR_SPEC } from "../../src/domain/resort/spec";
import { readRgbaPng } from "../support/png";
import { RESORT_CATALOG_ITEMS_JSON } from "../support/resortGear";

const BP = "packs/yasu_ride_bp/";
const RP = "packs/yasu_ride_rp/";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}entities/yasu_ride/beach_chair.se.json`)[
  "minecraft:entity"
];
const animations = read(
  `${RP}animations/yasu_ride/beach_chair.anim.json`,
).animations;
const states = read(`${RP}animation_controllers/yasu_ride/beach_chair.ac.json`)
  .animation_controllers["controller.animation.yasu_ride.beach_chair.form"];
const folded = "query.property('yasu_ride:folded')";
const { bedOutline, topHalf, topPx } = BEACH_CHAIR_SPEC;
const chairWidth = (bedOutline.maxX - bedOutline.minX) / 16;
const chairHitboxes = [
  bedOutline.minZ / 16 + chairWidth / 2,
  (bedOutline.minZ + bedOutline.maxZ) / 32,
  bedOutline.maxZ / 16 - chairWidth / 2,
].map((z) => ({
  width: chairWidth,
  height: (2 * topPx) / 16,
  pivot: [(bedOutline.minX + bedOutline.maxX) / 32, topPx / 16, z],
}));
const tableWidth = (2 * topHalf.halfX) / 16;
const tableHitboxes = [-1, 1].map((sign) => ({
  width: tableWidth,
  height: topPx / 16,
  pivot: [0, topPx / 32, sign * (topHalf.halfZ / 16 - tableWidth / 2)],
}));

describe("Beach Chair assets", () => {
  it("provides one script-controlled hip seat and a persistent, unpushable, damage-immune entity with gravity", () => {
    expect(entity.description).toEqual({
      identifier: "yasu_ride:beach_chair",
      is_spawnable: false,
      is_summonable: true,
      properties: {
        "yasu_ride:folded": { type: "bool", default: false, client_sync: true },
      },
    });
    const c = entity.components;
    expect(c["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      crouching_skip_interact: true,
      seats: [
        {
          position: [
            BEACH_CHAIR_SPEC.seatOffset.x,
            BEACH_CHAIR_SPEC.seatOffset.y,
            BEACH_CHAIR_SPEC.seatOffset.z,
          ],
        },
      ],
    });
    expect(c["minecraft:type_family"].family).toContain("inanimate");
    expect(c["minecraft:persistent"]).toEqual({});
    expect(c["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:knockback_resistance"].value).toBe(1);
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
    expect(c["minecraft:collision_box"]).toEqual({
      width: 1.0,
      height: 0.5625,
    });
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual(chairHitboxes);
  });

  it("keeps the foot at -z, the raised backrest at +z, and both forms and transitions within three cells", () => {
    const texture = readRgbaPng(
      `${RP}textures/entity/yasu_ride/beach_chair.png`,
    );
    expect([texture.width, texture.height]).toEqual([144, 32]);
    for (let y = 0; y < 32; y++) {
      for (let x = 80; x < 96; x++) {
        const offset = (y * texture.width + x) * 4;
        expect([...texture.pixels.slice(offset, offset + 4)]).toEqual([
          34, 26, 21, 255,
        ]);
      }
    }
    execFileSync("python3", [
      "-I",
      "-c",
      `
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_beach_chair')
r = load_tool('render_preview')
g = json.loads(Path('${RP}models/entity/yasu_ride/beach_chair.geo.json').read_text())['minecraft:geometry'][0]
assert [b['name'] for b in g['bones']] == ['root', 'chair_form', 'frame', 'backrest', 'prop', 'table_form', 'table_top']
assert g['description']['visible_bounds_width'] == 3.5 and g['description']['visible_bounds_height'] == 2.5
assert g['description']['texture_width'] == 144 and g['description']['texture_height'] == 32
assert m.SEAT_OFFSET == (0, 0.5625, 0.3125)
assert m.TOP_PX == 9 and m.HALF == (8,23) and m.BED_OUTLINE == (-8,8,-23,23)
assert m.TABLE_TOP_PX == ${BEACH_CHAIR_SPEC.topPx} == 9
back = next(b for b in g['bones'] if b['name']=='backrest')
assert back['pivot'] == [0,9,9.5] and back['rotation'] == [37,0,0]
assert len([c for c in back['cubes'] if c['size'][2] > 13]) == 13
frame = next(b for b in g['bones'] if b['name']=='frame')
assert min(c['origin'][2] for c in frame['cubes']) == -23
def close(a,b):
    return abs(a-b) < 1e-6

def check_legs(cubes, expected):
    legs = [c for c in cubes if close(c['origin'][1], 0.27)]
    pads = [c for c in cubes if c['origin'][1] == 0]
    assert len(legs) == len(pads) == len(expected)
    for x,z,size,top in expected:
        leg = next(c for c in legs if close(c['origin'][0], x) and close(c['origin'][2], z))
        assert all(close(a,b) for a,b in zip(leg['size'], [size,top-0.27-m.JOINT_SEAM,size]))
        pad = next(c for c in pads if close(c['origin'][0], x+0.11) and close(c['origin'][2], z+0.11))
        assert all(close(a,b) for a,b in zip(pad['size'], [size-0.22,0.27,size-0.22]))
        assert pad['uv']['up']['uv'] == [80,0]
    return legs
legs = check_legs(frame['cubes'],
    [(x,z,1.55,7.2) for x in (-8,6.45) for z in (-11.5,12.95)] +
    [(x,-22.5,1.55,7.2) for x in (-7.05,5.5)] +
    [(x,21.45,1.55,7.2) for x in (-8,6.45)])
foot_slats = [c for c in frame['cubes'] if c['origin'][2] == -23 and c['origin'][1] == m.SLAT_BOTTOM]
assert len(foot_slats) == 12
assert abs(min(c['origin'][0] for c in foot_slats)+6.84) < 1e-6
assert abs(max(c['origin'][0]+c['size'][0] for c in foot_slats)-6.84) < 1e-6
fingers = [c for c in frame['cubes'] if c['origin'][2] == m.BAND_START and abs(c['size'][0]-m.FINGER_WIDTH) < 1e-6]
assert len(fingers) == 12
assert m.MAIN_RAIL_BOTTOM == m.EXTENSION_RAIL_BOTTOM == m.REAR_RAIL_BOTTOM == 7.2
assert m.MAIN_RAIL_BOTTOM > m.SLAT_BOTTOM - m.MAIN_RAIL_BOTTOM
slats = sorted([c for c in back['cubes'] if c['size'][2] > 13], key=lambda c:c['origin'][0])
for left, right in zip(slats, slats[1:]):
    gap = right['origin'][0] - left['origin'][0] - left['size'][0]
    assert abs(gap - 0.48) < 1e-6
prop = next(b for b in g['bones'] if b['name']=='prop')
assert len(prop['cubes']) == 2
assert close(m.PROP_ANGLE, 26.76422011152607)
assert close(m.PROP_LENGTH, 9.339824532327768)
assert m.PROP_ATTACHMENT == 0.4
assert abs(m.PROP_PIVOT[1] - (m.REAR_RAIL_BOTTOM + m.REAR_RAIL_TOP)/2) < 1e-6
assert m.PROP_PIVOT[2] < 23
import math
assert abs(m.PROP_PIVOT[1] + m.PROP_LENGTH*math.sin(math.radians(m.PROP_ANGLE)) - m.PROP_START[1]) < 1e-6
assert abs(m.PROP_PIVOT[2] - m.PROP_LENGTH*math.cos(math.radians(m.PROP_ANGLE)) - m.PROP_START[2]) < 1e-6
for c in prop['cubes']:
    assert abs(c['size'][0] - 0.16) < 1e-6
    assert abs(c['size'][1] - 0.11) < 1e-6
    assert abs(c['rotation'][0] + m.PROP_ANGLE) < 1e-6
# The thirteen bed slats meet the backrest at the hinge without added hardware.
bed = sorted([c for c in frame['cubes'] if c['origin'][2] == m.BAND_END and close(c['size'][0],m.SLAT_WIDTH)], key=lambda c:c['origin'][0])
assert len(bed) == len(slats) == 13
for a,b in zip(bed,slats):
    assert a['origin'][0] == b['origin'][0] and a['size'][0] == b['size'][0]
    assert abs(a['origin'][2] + a['size'][2] - b['origin'][2]) < 1e-6
rear = [c for c in frame['cubes'] if c['origin'][2] == m.MAIN_RAIL_END and close(c['size'][2], 8.5)]
assert len(rear) == 2
assert all(close(c['size'][0], 0.55) and abs(c['size'][1]-1.56)<1e-6 and close(c['size'][2], 8.5) for c in rear)
assert all(abs(c['origin'][1] + c['size'][1] - m.REAR_RAIL_TOP) < 1e-6 for c in rear)
assert len(back['cubes']) == 14
assert not any(c['uv']['up']['uv'] == [48,0] for c in frame['cubes'])
assert not any(c['uv']['up']['uv'] == [64, 0] for b in g['bones'][:5] for c in b.get('cubes', []))
assert abs(m.BAND_END - m.BAND_START - 3.5) < 1e-6
assert m.MAIN_RAIL_START == m.BAND_END
assert all(close(c['origin'][1]+c['size'][1],9) for c in foot_slats+bed)
assert m.LEG_SIZE == m.EXTENSION_LEG_SIZE == m.REAR_LEG_SIZE == 1.55
band = sorted([c for c in frame['cubes'] if c['origin'][2] == m.BAND_START], key=lambda c:c['origin'][0])
assert len(band) == 25
assert all(close(c['origin'][1],m.SLAT_BOTTOM) and close(c['origin'][1]+c['size'][1],9) for c in band)
for left, right in zip(band, band[1:]):
    assert right['origin'][0] - left['origin'][0] - left['size'][0] >= 0.21999
rails = [c for c in frame['cubes'] if c['size'][2] > 5 and c['origin'][1] < m.SLAT_BOTTOM]
assert len(rails) == 6
for rail in rails:
    extension = rail['origin'][2] == -23
    rear_rail = rail['origin'][2] == m.MAIN_RAIL_END
    assert close(rail['size'][0], 0.55)
    assert close(rail['size'][1], 1.56 if extension or rear_rail else 1.8)
    assert close(rail['origin'][1], 7.2)
assert close(m.MAIN_RAIL_BOTTOM / (m.TOP_PX - m.MAIN_RAIL_BOTTOM), 7.2/1.8)
for c in prop['cubes']:
    assert close(abs(c['origin'][0] + c['size'][0]/2), 6.37)
# Oblique views must leave air between the raised slats on both faces.
animations = json.loads(Path('${RP}animations/yasu_ride/beach_chair.anim.json').read_text())['animations']
# The stowed prop must lie flat, so every stowed key uses the generated slope.
assert close(animations['animation.yasu_ride.beach_chair.table']['bones']['prop']['rotation'][0], m.PROP_ANGLE)
assert close(animations['animation.yasu_ride.beach_chair.fold']['bones']['prop']['rotation']['0.5'][0], m.PROP_ANGLE)
assert close(animations['animation.yasu_ride.beach_chair.unfold']['bones']['prop']['rotation']['0.0'][0], m.PROP_ANGLE)
posed = r.static_pose(g, animations['animation.yasu_ride.beach_chair.chair'])
turns = r.bone_turns(posed['bones'])['backrest']
def world(point):
    for pivot, rotation in turns:
        point = r.rotate(point, pivot, rotation)
    return (-point[0], point[1], point[2])
points = [world(p) for slat in slats for p in m.tilt.corners(slat)]
for view in [(-1.5,1.1,-2.5), (2.2,1.1,-1.7), (-3,1,-1.3)]:
    camera = r.Camera(points, view=view)
    start, end = [camera.project(world((0,9,z))) for z in (13,14)]
    across = (end[1]-start[1], start[0]-end[0])
    edges = []
    for slat in slats:
        section = [camera.project(world((x,y,13)))
                   for x in (slat['origin'][0], slat['origin'][0]+slat['size'][0])
                   for y in (slat['origin'][1], 9)]
        projected = [p[0]*across[0]+p[1]*across[1] for p in section]
        edges.append((min(projected), max(projected)))
    edges.sort()
    assert all(right[0] > left[1] for left,right in zip(edges,edges[1:])), view
for step in range(11):
    t = step/10
    pose = json.loads(json.dumps(animations['animation.yasu_ride.beach_chair.chair']))
    pose['bones']['backrest']['rotation'] = [-37*t,0,0]
    pose['bones']['prop']['rotation'] = [m.PROP_ANGLE*t,0,0]
    if step == 10: pose = animations['animation.yasu_ride.beach_chair.table']
    posed = r.static_pose(g, pose)
    turns = r.bone_turns(posed['bones'])
    all_points = []
    for bone in posed['bones']:
        points = []
        for cube in bone.get('cubes', []):
            for point in m.tilt.corners(cube):
                for pivot, rotation in turns[bone['name']]:
                    point = r.rotate(point, pivot, rotation)
                assert -8.00001 <= point[0] <= 8.00001, point
                assert -23.00001 <= point[2] <= 23.00001, point
                assert point[1] >= -0.00001, point
                points.append(point)
        if bone['name'] == 'backrest' and points:
            assert min(p[2] for p in points) > 5
            if step == 0: assert max(p[1] for p in points) > 17
            if step == 10: assert abs(max(p[1] for p in points)-m.TOP_PX)<0.00001
        all_points.extend(points)
    if step == 10: assert abs(max(p[1] for p in all_points)-m.TABLE_TOP_PX)<0.00001
table = r.static_pose(g, animations['animation.yasu_ride.beach_chair.table'])
assert all(not b.get('cubes') for b in table['bones'] if b['name'] in ['frame','backrest','prop'])
base = next(b for b in table['bones'] if b['name']=='table_form')['cubes']
assert m.TABLE_TOP_PX == m.TOP_PX == 9 and close(m.TABLE_RAIL_BOTTOM, 6.63)
check_legs(base, [(x,z,1.55,6.63) for x in (-8,6.45) for z in (-10.5,8.95)])
aprons = [c for c in base if close(c['origin'][1],6.63)]
assert len(aprons) == 4
assert all(close(c['size'][1],2.13) for c in aprons)
assert all(close(min(c['size'][0],c['size'][2]),0.55) for c in aprons)
top = next(b for b in table['bones'] if b['name']=='table_top')['cubes']
assert all(abs(c['origin'][1]-m.TABLE_SLAT_BOTTOM) < 1e-6 for c in top)
assert all(abs(c['origin'][1]+c['size'][1]-m.TABLE_TOP_PX) < 1e-6 for c in top)
assert all(abs(c['origin'][1]+c['size'][1]-m.TOP_PX) < 1e-6 for c in bed)
def filled(x,z):
    return any(c['origin'][0] <= x <= c['origin'][0]+c['size'][0] and
               c['origin'][2] <= z <= c['origin'][2]+c['size'][2] for c in top)
# The only uncovered surface is twelve isolated square holes across the middle.
centres = [-7.43 + k*1.18 + 0.35 for k in range(13)]
holes = [(a+b)/2 for a,b in zip(centres,centres[1:])]
for ix in range(320):
    x = -8+(ix+0.5)/20
    for iz in range(420):
        z = -10.5+(iz+0.5)/20
        hole = abs(z-m.TABLE_Z_CENTER)<0.24 and any(abs(x-h)<0.24 for h in holes)
        assert filled(x,z) != hole, (x,z)
assert m.TABLE_Z_MAX - m.TABLE_Z_MIN == m.HINGE[2] - m.MAIN_RAIL_START
assert m.TABLE_Z_MIN == -10.5 and m.TABLE_Z_MAX == 10.5 and m.TABLE_Z_CENTER == 0
assert min(c['origin'][0] for c in top) == -8
assert max(c['origin'][0]+c['size'][0] for c in top) == 8
assert min(c['origin'][2] for c in top) == -10.5
assert max(c['origin'][2]+c['size'][2] for c in top) == 10.5
assert all(close(c['origin'][1],8.76) and close(c['origin'][1]+c['size'][1],9) for c in top)
# Deep slats with dark inner walls make the bed gaps read as dark slots.
assert close(m.TOP_PX - m.SLAT_BOTTOM, 0.73)
inner = [c for c in bed if abs(c['origin'][0]) < 6.7]
assert len(inner) == 11
assert all(c['uv'][side]['uv'][0] == m.GAP_SLOT*16 for c in inner for side in ('east','west','down'))
assert all(c['uv']['up']['uv'] == [16,0] and c['uv']['north']['uv'] == [m.END_GRAIN_SLOT*16,0] for c in inner)
assert all(c['uv']['east']['uv'] == [m.RAIL_SLOT*16,16] for c in bed if c not in inner)

`,
    ]);
  });

  it("loads directly into the saved end pose and runs ten-tick fold and unfold transitions", () => {
    expect(states.initial_state).toBe("initial");
    expect(states.states.initial).toEqual({
      transitions: [{ table: folded }, { chair: `!${folded}` }],
    });
    expect(states.states.chair).toEqual({
      animations: ["chair"],
      transitions: [{ fold: folded }],
    });
    expect(states.states.table).toEqual({
      animations: ["table"],
      transitions: [{ unfold: `!${folded}` }],
    });
    for (const [name, start, end] of [
      ["fold", "chair", "table"],
      ["unfold", "table", "chair"],
    ] as const) {
      const animation = animations[`animation.yasu_ride.beach_chair.${name}`];
      expect(animation.animation_length).toBe(0.5);
      expect(animation.loop).toBe("hold_on_last_frame");
      for (const bone of ["backrest", "prop"]) {
        expect(animation.bones[bone].rotation["0.0"]).toEqual(
          animations[`animation.yasu_ride.beach_chair.${start}`].bones[bone]
            .rotation,
        );
        expect(animation.bones[bone].rotation["0.5"]).toEqual(
          animations[`animation.yasu_ride.beach_chair.${end}`].bones[bone]
            .rotation,
        );
      }
      for (const bone of ["chair_form", "table_form"]) {
        const startScale =
          animations[`animation.yasu_ride.beach_chair.${start}`].bones[bone]
            .scale;
        const endScale =
          animations[`animation.yasu_ride.beach_chair.${end}`].bones[bone]
            .scale;
        expect(animation.bones[bone].scale).toEqual({
          "0.0": startScale,
          "0.5": { pre: startScale, post: endScale },
        });
      }
      expect(states.states[name].transitions).toContainEqual({
        [end]: "query.all_animations_finished",
      });
    }
    const client = read(`${RP}entity/yasu_ride/beach_chair.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.scripts.animate).toEqual(["form"]);
    expect(client.animations.form).toBe(
      "controller.animation.yasu_ride.beach_chair.form",
    );
    for (const name of ["chair", "table", "fold", "unfold"])
      expect(animations[client.animations[name]]).toBeDefined();
    expect(client.geometry.default).toBe("geometry.yasu_ride.beach_chair");
    expect(client.textures.default).toBe(
      "textures/entity/yasu_ride/beach_chair",
    );
    const rc = read(`${RP}render_controllers/yasu_ride/beach_chair.rc.json`)
      .render_controllers[client.render_controllers[0]];
    expect(rc.textures).toEqual(["Texture.default"]);
  });

  it("lists the chair after the parasol and supplies its plank-stick-iron recipe, names, preview, and icon", () => {
    const catalog = read(`${BP}item_catalog/crafting_item_catalog.json`);
    expect(JSON.stringify(catalog)).toContain(RESORT_CATALOG_ITEMS_JSON);
    const item = read(`${BP}items/yasu_ride/beach_chair_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe("yasu_ride:beach_chair_item");
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_beach_chair");
    expect(item.components["minecraft:display_name"].value).toBe(
      "item.yasu_ride:beach_chair_item.name",
    );
    const recipe = read(`${BP}recipes/yasu_ride/beach_chair_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.pattern).toEqual(["P P", "PPP", "SIS"]);
    expect(recipe.key).toEqual({
      P: { tag: "minecraft:planks" },
      S: { item: "minecraft:stick" },
      I: { item: "minecraft:iron_ingot" },
    });
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.result).toEqual({
      item: "yasu_ride:beach_chair_item",
      count: 1,
    });
    const ingredients = (r: typeof recipe) =>
      r.pattern
        .map((row: string) =>
          [...row].map((key) => JSON.stringify(r.key[key] ?? null)).join(","),
        )
        .join(";");
    for (const file of readdirSync(`${BP}recipes/yasu_ride`)) {
      if (file === "beach_chair_item.recipe.json") continue;
      const other = read(`${BP}recipes/yasu_ride/${file}`)[
        "minecraft:recipe_shaped"
      ];
      if (other) expect(ingredients(other), file).not.toBe(ingredients(recipe));
    }
    expect(
      read(`${RP}textures/item_texture.json`).texture_data
        .yasu_ride_beach_chair,
    ).toEqual({ textures: "textures/items/yasu_ride/beach_chair_item" });
    for (const [path, size] of [
      ["docs/images/items/camping-gear/beach_chair.png", 128],
      [`${RP}textures/items/yasu_ride/beach_chair_item.png`, 32],
    ] as const) {
      const png = readRgbaPng(path);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(png.pixels[3]).toBe(0);
      expect(png.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
    for (const [locale, name] of [
      ["en_US", "Beach Chair"],
      ["ja_JP", "\u30d3\u30fc\u30c1\u30c1\u30a7\u30a2"],
    ]) {
      expect(readFileSync(`${RP}texts/${locale}.lang`, "utf8")).toContain(
        `item.yasu_ride:beach_chair_item.name=${name}\n`,
      );
    }
  });
});

it("keeps the folded entity fixed at its pose", () => {
  expect(entity.component_groups["yasu_ride:beach_chair_table"]).toEqual({
    "minecraft:physics": { has_collision: false, has_gravity: false },
    "minecraft:custom_hit_test": { hitboxes: tableHitboxes },
  });
  expect(entity.component_groups["yasu_ride:beach_chair_lounger"]).toEqual({
    "minecraft:physics": { has_collision: true, has_gravity: true },
    "minecraft:custom_hit_test": { hitboxes: chairHitboxes },
  });
  expect(entity.events["yasu_ride:beach_chair_fold"]).toEqual({
    add: { component_groups: ["yasu_ride:beach_chair_table"] },
    remove: { component_groups: ["yasu_ride:beach_chair_lounger"] },
  });
  expect(entity.events["yasu_ride:beach_chair_unfold"]).toEqual({
    remove: { component_groups: ["yasu_ride:beach_chair_table"] },
    add: { component_groups: ["yasu_ride:beach_chair_lounger"] },
  });
});

it("shrinks the folded hit boxes to the table so hosted items above its top stay reachable", () => {
  const boxes =
    entity.component_groups["yasu_ride:beach_chair_table"][
      "minecraft:custom_hit_test"
    ].hitboxes;
  const top = BEACH_CHAIR_SPEC.topPx / 16;
  const halfX = BEACH_CHAIR_SPEC.topHalf.halfX / 16;
  const halfZ = BEACH_CHAIR_SPEC.topHalf.halfZ / 16;
  const bounds = (b: {
    width: number;
    height: number;
    pivot: [number, number, number];
  }) => ({
    minX: b.pivot[0] - b.width / 2,
    maxX: b.pivot[0] + b.width / 2,
    minY: b.pivot[1] - b.height / 2,
    maxY: b.pivot[1] + b.height / 2,
    minZ: b.pivot[2] - b.width / 2,
    maxZ: b.pivot[2] + b.width / 2,
  });
  const all: ReturnType<typeof bounds>[] = boxes.map(bounds);
  for (const b of all) {
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(top);
    expect(b.minX).toBeCloseTo(-halfX);
    expect(b.maxX).toBeCloseTo(halfX);
  }
  expect(Math.min(...all.map((b) => b.minZ))).toBeCloseTo(-halfZ);
  expect(Math.max(...all.map((b) => b.maxZ))).toBeCloseTo(halfZ);
});

it.each(["en_US", "ja_JP"])(
  "localizes every Beach Chair hint in %s",
  (locale) => {
    const lang = readFileSync(`${RP}texts/${locale}.lang`, "utf8");
    for (const key of [
      "blocked",
      "hits_left",
      "taken",
      "occupied",
      "folded",
      "something_on_top",
    ]) {
      expect(lang).toMatch(
        new RegExp(`^yasu_ride\\.beach_chair\\.${key}=.+$`, "m"),
      );
    }
  },
);
