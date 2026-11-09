import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEACH_CHAIR_SPEC } from "../../src/domain/resort/spec";
import { readRgbaPng } from "../support/png";

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
      seats: [{ position: [0, 0.4375, 0.125] }],
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
      width: 0.75,
      height: 0.4375,
    });
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual(
      [-0.625, 0, 0.625].map((z) => ({
        width: 0.75,
        height: 0.875,
        pivot: [0, 0.4375, z],
      })),
    );
  });

  it("keeps the foot at -z, the raised backrest at +z, and both forms and transitions within two cells", () => {
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
assert m.SEAT_OFFSET == (0, 0.4375, 0.125)
assert m.TOP_PX == 7 and m.HALF == (6,16) and m.BED_OUTLINE == (-6,6,-16,16)
back = next(b for b in g['bones'] if b['name']=='backrest')
assert back['pivot'] == [0,7,3] and back['rotation'] == [37,0,0]
assert len([c for c in back['cubes'] if c['size'][2] > 10]) == 12
frame = next(b for b in g['bones'] if b['name']=='frame')
assert min(c['origin'][2] for c in frame['cubes']) == -16
legs = [c for c in frame['cubes'] if c['origin'][1] == 0]
assert len(legs) == 8
assert all(c['size'] == [2, 6.2, 2] for c in legs)
assert sorted(set(c['origin'][2] for c in legs)) == [-16, -7.4, 1, 14]
foot_slats = [c for c in frame['cubes'] if c['origin'][2] == -16 and c['origin'][1] == m.SLAT_BOTTOM]
assert len(foot_slats) == 9
assert abs(min(c['origin'][0] for c in foot_slats)+5) < 1e-6
assert abs(max(c['origin'][0]+c['size'][0] for c in foot_slats)-5) < 1e-6
fingers = [c for c in frame['cubes'] if c['origin'][2] == m.BAND_START and abs(c['size'][0]-m.FINGER_WIDTH) < 1e-6]
assert len(fingers) == 9
assert m.MAIN_RAIL_BOTTOM < m.FOOT_RAIL_BOTTOM
assert m.MAIN_RAIL_BOTTOM > m.SLAT_BOTTOM - m.MAIN_RAIL_BOTTOM
slats = sorted([c for c in back['cubes'] if c['size'][2] > 10], key=lambda c:c['origin'][0])
for left, right in zip(slats, slats[1:]):
    gap = right['origin'][0] - left['origin'][0] - left['size'][0]
    assert abs(gap - 0.18) < 1e-6
prop = next(b for b in g['bones'] if b['name']=='prop')
assert len(prop['cubes']) == 2
assert 27 < m.PROP_ANGLE < 29
assert m.PROP_ATTACHMENT == 0.4
assert abs(m.PROP_PIVOT[1] - (m.REAR_RAIL_BOTTOM + m.REAR_RAIL_TOP)/2) < 1e-6
assert m.PROP_PIVOT[2] < 16
import math
assert abs(m.PROP_PIVOT[1] + m.PROP_LENGTH*math.sin(math.radians(m.PROP_ANGLE)) - m.PROP_START[1]) < 1e-6
assert abs(m.PROP_PIVOT[2] - m.PROP_LENGTH*math.cos(math.radians(m.PROP_ANGLE)) - m.PROP_START[2]) < 1e-6
for c in prop['cubes']:
    assert abs(c['size'][0] - 0.25) < 1e-6
    assert abs(c['size'][1] - 0.12) < 1e-6
    assert abs(c['rotation'][0] + m.PROP_ANGLE) < 1e-6
# The twelve bed slats meet the backrest at the hinge without added hardware.
bed = sorted([c for c in frame['cubes'] if c['origin'][2] == m.BAND_END and c['size'][2] > 10], key=lambda c:c['origin'][0])
assert len(bed) == len(slats) == 12
for a,b in zip(bed,slats):
    assert a['origin'][0] == b['origin'][0] and a['size'][0] == b['size'][0]
    assert abs(a['origin'][2] + a['size'][2] - b['origin'][2]) < 1e-6
rear = [c for c in frame['cubes'] if c['origin'][2] == 3 and c['size'][2] == 13]
assert len(rear) == 2
assert all(c['size'][0] == 1 and abs(c['size'][1]-1.1)<1e-6 and c['size'][2] == 13 for c in rear)
assert all(abs(c['origin'][1] + c['size'][1] - m.SLAT_BOTTOM) < 1e-6 for c in rear)
assert len(back['cubes']) == 13
assert not any(c['uv']['up']['uv'] == [48,0] for c in frame['cubes'])
assert not any(c['uv']['up']['uv'] == [64, 0] for b in g['bones'][:5] for c in b.get('cubes', []))
assert abs(m.BAND_END - m.BAND_START - 4.5) < 1e-6
band = sorted([c for c in frame['cubes'] if c['origin'][2] == m.BAND_START], key=lambda c:c['origin'][0])
assert len(band) == 19
for left, right in zip(band, band[1:]):
    assert right['origin'][0] - left['origin'][0] - left['size'][0] >= 0.23999
for leg in legs:
    half = 5 if leg['origin'][2] == -16 else 6
    assert leg['origin'][0] in (-half, half-2)
rails = [c for c in frame['cubes'] if c['size'][2] > 5 and c['origin'][1] < m.SLAT_BOTTOM]
assert all(c['size'][0] == (1 if c['origin'][2] == 3 else 1.5) for c in rails)
assert 2 <= m.MAIN_RAIL_BOTTOM / (m.SLAT_BOTTOM - m.MAIN_RAIL_BOTTOM) <= 3
# Oblique views must leave air between the raised slats on both faces.
animations = json.loads(Path('${RP}animations/yasu_ride/beach_chair.anim.json').read_text())['animations']
posed = r.static_pose(g, animations['animation.yasu_ride.beach_chair.chair'])
turns = r.bone_turns(posed['bones'])['backrest']
def world(point):
    for pivot, rotation in turns:
        point = r.rotate(point, pivot, rotation)
    return (-point[0], point[1], point[2])
points = [world(p) for slat in slats for p in m.tilt.corners(slat)]
for view in [(-1.5,1.1,-2.5), (2.2,1.1,-1.7), (-3,1,-1.3)]:
    camera = r.Camera(points, view=view)
    start, end = [camera.project(world((0,7,z))) for z in (8,9)]
    across = (end[1]-start[1], start[0]-end[0])
    edges = []
    for slat in slats:
        section = [camera.project(world((x,y,8)))
                   for x in (slat['origin'][0], slat['origin'][0]+slat['size'][0])
                   for y in (slat['origin'][1], 7)]
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
                assert -6.00001 <= point[0] <= 6.00001, point
                assert -16.00001 <= point[2] <= 16.00001, point
                assert point[1] >= -0.00001, point
                points.append(point)
        if bone['name'] == 'backrest' and points:
            assert min(p[2] for p in points) > 2
            if step == 0: assert max(p[1] for p in points) > 14
            if step == 10: assert abs(max(p[1] for p in points)-m.TOP_PX)<0.00001
        all_points.extend(points)
    if step == 10: assert abs(max(p[1] for p in all_points)-m.TOP_PX)<0.00001
table = r.static_pose(g, animations['animation.yasu_ride.beach_chair.table'])
assert all(not b.get('cubes') for b in table['bones'] if b['name'] in ['frame','backrest','prop'])
base = next(b for b in table['bones'] if b['name']=='table_form')['cubes']
legs = [c for c in base if c['origin'][1] == 0]
assert len(legs) == 4
assert {(c['origin'][0], c['origin'][2]) for c in legs} == {(-6,-16),(-6,14),(4,-16),(4,14)}
assert all(c['size'] == [2,6.2,2] for c in legs)
top = next(b for b in table['bones'] if b['name']=='table_top')['cubes']
def filled(x,z):
    return any(c['origin'][0] <= x <= c['origin'][0]+c['size'][0] and
               c['origin'][2] <= z <= c['origin'][2]+c['size'][2] for c in top)
# The only uncovered surface is nine isolated square holes across the middle.
centres = [-5.58 + k*1.16 + 0.36 for k in range(10)]
holes = [(a+b)/2 for a,b in zip(centres,centres[1:])]
for ix in range(240):
    x = -6+(ix+0.5)/20
    for iz in range(640):
        z = -16+(iz+0.5)/20
        hole = abs(z)<0.18 and any(abs(x-h)<0.18 for h in holes)
        assert filled(x,z) != hole, (x,z)
assert min(c['origin'][0] for c in top) == -6
assert max(c['origin'][0]+c['size'][0] for c in top) == 6
assert min(c['origin'][2] for c in top) == -16
assert max(c['origin'][2]+c['size'][2] for c in top) == 16

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
    expect(JSON.stringify(catalog)).toContain(
      '"items":["yasu_ride:beach_parasol_item","yasu_ride:beach_chair_item"]',
    );
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

it("defines invisible, protected tabletop support with boxes matching the measured top", () => {
  const block = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/blocks/yasu_ride/beach_chair_top.block.json",
      "utf8",
    ),
  )["minecraft:block"];
  expect(block.description.identifier).toBe("yasu_ride:beach_chair_top");
  const components = block.components;
  expect(components["minecraft:geometry"].bone_visibility).toEqual({
    root: false,
  });
  expect(components["minecraft:collision_box"]).toEqual({
    origin: [-8, 0, -8],
    size: [16, BEACH_CHAIR_SPEC.topPx, 16],
  });
  expect(components["minecraft:selection_box"]).toEqual(
    components["minecraft:collision_box"],
  );
  expect(components["minecraft:destructible_by_mining"]).toBe(false);
  expect(components["minecraft:destructible_by_explosion"]).toBe(false);
  expect(components["minecraft:light_dampening"]).toBe(0);
  expect(components["yasu_ride:beach_chair_top"]).toEqual({});
  expect(components["tag:yasu_ride:laid"]).toEqual({});
});

it("keeps the folded entity fixed while its support blocks occupy its cells", () => {
  expect(entity.component_groups["yasu_ride:beach_chair_table"]).toEqual({
    "minecraft:physics": { has_collision: false, has_gravity: false },
  });
  expect(entity.events["yasu_ride:beach_chair_fold"]).toEqual({
    add: { component_groups: ["yasu_ride:beach_chair_table"] },
  });
  expect(entity.events["yasu_ride:beach_chair_unfold"]).toEqual({
    remove: { component_groups: ["yasu_ride:beach_chair_table"] },
  });
});
