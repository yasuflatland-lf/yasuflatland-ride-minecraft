// The tent content contract (ADR 0130), before pitching adds any behavior.
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { TENT_SPEC } from "../../src/domain/camp/spec";
import {
  FLAP_BLOCKED_HINT,
  PITCH_REFUSAL_MESSAGE,
  TENT_CEILING_BLOCK,
  TENT_FACE_STATE,
  TENT_FAMILY,
  TENT_FLAP_BLOCK,
  TENT_FLAP_COMPONENT,
  TENT_FLAP_PROPERTY,
  TENT_HITS_LEFT_HINT,
  TENT_ITEM,
  TENT_LANTERN_PROPERTY,
  TENT_OCCUPIED_HINT,
  TENT_OPEN_STATE,
  TENT_TYPE,
  TENT_WALL_BLOCK,
} from "../../src/infrastructure/camp/identifiers";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
interface Cube {
  origin: [number, number, number];
  size: [number, number, number];
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
}

// x and z turn the other way from a right-handed rotation in game, as in
// tools/render_preview.py's game_turn (ADR 0051, 0058).
function corners(cube: Cube): [number, number, number][] {
  const [x0, y0, z0] = cube.origin;
  const [w, h, d] = cube.size;
  const points: [number, number, number][] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1]) points.push([x0 + i * w, y0 + j * h, z0 + k * d]);
  if (!cube.rotation || !cube.pivot) return points;
  // Only x and z turns are modeled, so a y turn must not slip past the bounds checks.
  expect(cube.rotation[1]).toBe(0);
  const [px, py, pz] = cube.pivot;
  const [rx, , rz] = cube.rotation.map((a) => (a * Math.PI) / 180) as [
    number,
    number,
    number,
  ];
  const [cx, sx, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(rz),
    Math.sin(rz),
  ];
  return points.map(([x, y, z]) => {
    let [dx, dy, dz] = [x - px, y - py, z - pz];
    [dy, dz] = [dy * cx + dz * sx, -dy * sx + dz * cx];
    [dx, dy] = [dx * cz + dy * sz, -dx * sz + dy * cz];
    return [dx + px, dy + py, dz + pz];
  });
}

interface Bone {
  name: string;
  parent?: string;
  pivot: number[];
  cubes?: Cube[];
}
type Bounds = [number, number, number, number, number, number];
const geometry = () =>
  readJson(`${RP}/models/entity/yasu_ride/tent.geo.json`)[
    "minecraft:geometry"
  ][0];
const bounds = (c: Cube): Bounds => {
  const p = corners(c);
  return [
    Math.min(...p.map((v) => v[0])),
    Math.min(...p.map((v) => v[1])),
    Math.min(...p.map((v) => v[2])),
    Math.max(...p.map((v) => v[0])),
    Math.max(...p.map((v) => v[1])),
    Math.max(...p.map((v) => v[2])),
  ];
};
function inside(b: Bounds, outer: Bounds) {
  for (const i of [0, 1, 2]) {
    expect(b[i]).toBeGreaterThanOrEqual((outer[i] ?? 0) - 0.002);
    expect(b[i + 3]).toBeLessThanOrEqual((outer[i + 3] ?? 0) + 0.002);
  }
}
const overlaps = (a: Bounds, b: Bounds) =>
  [0, 1, 2].every(
    (i) =>
      (a[i] ?? 0) < (b[i + 3] ?? 0) - 0.002 &&
      (a[i + 3] ?? 0) > (b[i] ?? 0) + 0.002,
  );
const openings: Record<string, Bounds> = {
  flap_front: [-8, 0, -136, 8, 32, -135],
  flap_left: [53, 0, -88, 54, 32, -72],
  flap_right: [-54, 0, -88, -53, 32, -72],
  flap_bedroom: [-8, 0, -56, 8, 32, -55],
};
describe("tent entity and client", () => {
  it("declares exactly the spawn-time entity contract", () => {
    const doc = readJson(`${BP}/entities/yasu_ride/tent.se.json`);
    expect(doc.format_version).toBe("1.21.80");
    const e = doc["minecraft:entity"];
    expect(e.description).toEqual({
      identifier: TENT_TYPE,
      is_spawnable: false,
      is_summonable: true,
      properties: {
        ...Object.fromEntries(
          Object.values(TENT_FLAP_PROPERTY).map((p) => [
            p,
            { type: "float", range: [0, 1], default: 0, client_sync: true },
          ]),
        ),
        [TENT_LANTERN_PROPERTY]: {
          type: "bool",
          default: false,
          client_sync: true,
        },
      },
    });
    expect(e.components).toEqual({
      "minecraft:type_family": { family: [TENT_FAMILY, "inanimate"] },
      "minecraft:variant": { value: 0 },
      "minecraft:collision_box": { width: 0.2, height: 0.2 },
      "minecraft:custom_hit_test": {
        hitboxes: [{ width: 0.1, height: 0.1, pivot: [0, 0.05, 0] }],
      },
      "minecraft:physics": { has_collision: false, has_gravity: false },
      "minecraft:pushable": {
        is_pushable: false,
        is_pushable_by_piston: false,
      },
      "minecraft:knockback_resistance": { value: 1 },
      "minecraft:health": { value: 20, max: 20 },
      "minecraft:damage_sensor": {
        triggers: { cause: "all", deals_damage: "no" },
      },
      "minecraft:persistent": {},
    });
    const collision = e.components["minecraft:collision_box"];
    inside(
      [
        -collision.width / 2,
        0,
        -collision.width / 2,
        collision.width / 2,
        collision.height,
        collision.width / 2,
      ],
      [-0.5, 0, -0.5, 0.5, 1, 0.5],
    );
    const hit = e.components["minecraft:custom_hit_test"].hitboxes[0];
    inside(
      [
        hit.pivot[0] - hit.width / 2,
        hit.pivot[1] - hit.height / 2,
        hit.pivot[2] - hit.width / 2,
        hit.pivot[0] + hit.width / 2,
        hit.pivot[1] + hit.height / 2,
        hit.pivot[2] + hit.width / 2,
      ],
      [-0.5, 0, -0.5, 0.5, 1, 0.5],
    );
    expect(e.component_groups).toBeUndefined();
    expect(e.events).toBeUndefined();
  });
  it("writes float property values with a decimal point", () => {
    // The engine rejects a float property whose default is written as 0
    // ("'default' value does not match the specified type 'float'") and then
    // drops every property of the entity, so JSON.parse alone cannot catch it.
    const text = readFileSync(`${BP}/entities/yasu_ride/tent.se.json`, "utf8");
    const floats = [
      ...text.matchAll(
        /"type": "float",\s*"range": \[(.*?)\],\s*"default": (.*?),/g,
      ),
    ];
    expect(floats).toHaveLength(4);
    for (const [, range, def] of floats) {
      expect(range).toBe("0.0, 1.0");
      expect(def).toBe("0.0");
    }
  });
  it("draws the tent, switches only the shade material, and rolls each flap about its top", () => {
    const doc = readJson(`${RP}/entity/yasu_ride/tent.ce.json`);
    expect(doc.format_version).toBe("1.10.0");
    const c = doc["minecraft:client_entity"].description;
    expect(c.identifier).toBe(TENT_TYPE);
    expect(c.geometry).toEqual({ default: "geometry.yasu_ride.tent" });
    expect(c.textures).toEqual({ default: "textures/entity/yasu_ride/tent" });
    expect(existsSync(`${RP}/${c.textures.default}.png`)).toBe(true);
    expect(c.materials).toEqual({
      default: "entity",
      lamp: "entity",
      lamp_lit: "entity_emissive",
    });
    expect(c.render_controllers).toEqual(["controller.render.yasu_ride.tent"]);
    const rc = readJson(`${RP}/render_controllers/yasu_ride/tent.rc.json`);
    expect(rc.format_version).toBe("1.8.0");
    expect(rc.render_controllers["controller.render.yasu_ride.tent"]).toEqual({
      arrays: {
        materials: { "Array.lamps": ["Material.lamp", "Material.lamp_lit"] },
      },
      geometry: "Geometry.default",
      materials: [
        { "*": "Material.default" },
        {
          lantern_glass:
            "Array.lamps[query.property('yasu_ride:lantern') ? 1 : 0]",
        },
      ],
      textures: ["Texture.default"],
    });
    const anim = readJson(`${RP}/animations/yasu_ride/tent.anim.json`);
    expect(anim.format_version).toBe("1.8.0");
    const names = Object.keys(TENT_FLAP_PROPERTY).map((n) => `flap_${n}`);
    expect(c.scripts.animate).toEqual(names);
    expect(c.animations).toEqual(
      Object.fromEntries(
        names.map((n) => [n, `animation.yasu_ride.tent.${n}`]),
      ),
    );
    expect(anim.animations).toEqual(
      Object.fromEntries(
        names.map((n) => [
          `animation.yasu_ride.tent.${n}`,
          {
            loop: true,
            bones: {
              [n]: {
                scale: [1, `1 - 0.875 * q.property('yasu_ride:${n}')`, 1],
              },
            },
          },
        ]),
      ),
    );
  });
});
describe("tent geometry and texture", () => {
  it("fixes all thirteen bones, parents, pivots, and visibility bounds", () => {
    const g = geometry();
    expect(g.description).toEqual({
      identifier: "geometry.yasu_ride.tent",
      texture_width: 16,
      texture_height: 16,
      visible_bounds_width: 13,
      visible_bounds_height: 5,
      visible_bounds_offset: [0, 2.5, -5.5],
    });
    const bones: Bone[] = g.bones;
    const expected = {
      root: [undefined, [0, 0, 0]],
      fly: ["root", [0, 0, 0]],
      inner: ["root", [0, 0, 0]],
      poles: ["root", [0, 0, 0]],
      strap: ["root", [0, 0, 0]],
      lantern: ["root", [0, 69, -64]],
      lantern_glass: ["lantern", [0, 40, -64]],
      flap_front: ["fly", [0, 32, -135.5]],
      flap_left: ["fly", [53.5, 32, -80]],
      flap_right: ["fly", [-53.5, 32, -80]],
      flap_bedroom: ["inner", [0, 32, -55.5]],
      mattress_0: ["root", [16, 0, -24]],
      mattress_1: ["root", [-16, 0, -24]],
    };
    expect(bones).toHaveLength(13);
    expect(
      Object.fromEntries(bones.map((b) => [b.name, [b.parent, b.pivot]])),
    ).toEqual(expected);
    expect(bones.at(-1)?.name).toBe("lantern_glass");
    expect(bones.find((b) => b.name === "root")?.cubes ?? []).toEqual([]);
  });
  it("keeps the rooms and tarp clear, with only the mattresses and hanging lantern inside", () => {
    const rooms: Bounds[] = [
      [-40, 0, -120, 40, 48, -56],
      [-40, 0, -40, 40, 48, -8],
      [-40, 0, -184, 40, 32, -136],
    ];
    const bones: Bone[] = geometry().bones;
    for (const bone of bones) {
      if (bone.name !== "root") expect(bone.cubes?.length).toBeGreaterThan(0);
      for (const cube of bone.cubes ?? []) {
        const b = bounds(cube);
        inside(b, [-56, 0, -184, 56, 72, 8]);
        for (const [i, room] of rooms.entries()) {
          if (!overlaps(b, room)) continue;
          if (i === 1 && bone.name.startsWith("mattress_")) continue;
          if (i === 0 && ["lantern", "lantern_glass"].includes(bone.name))
            inside(b, [-8, 32, -72, 8, 69, -56]);
          else expect(overlaps(b, room), bone.name).toBe(false);
        }
        const opening = openings[bone.name];
        if (opening) inside(b, opening);
        if (bone.name === "lantern_glass") inside(b, [-8, 32, -72, 8, 48, -56]);
        if (bone.name === "mattress_0") inside(b, [9, 0, -39, 23, 9, -9]);
        if (bone.name === "mattress_1") inside(b, [-23, 0, -39, -9, 9, -9]);
        for (const face of Object.values(cube.uv)) {
          expect(face.uv_size, bone.name).toEqual([4, 4]);
          const slot =
            Math.floor(face.uv[0] / 4) + 4 * Math.floor(face.uv[1] / 4);
          if (slot < 2)
            expect(["fly", "flap_front", "flap_left", "flap_right"]).toContain(
              bone.name,
            );
          if (bone.name === "flap_bedroom") expect([2, 3]).toContain(slot);
          // Slot 9 is the alpha-zero glass that the lantern material lights (ADR 0130).
          expect(slot === 9, bone.name).toBe(bone.name === "lantern_glass");
        }
      }
      if (bone.name.startsWith("mattress_"))
        expect(Math.max(...(bone.cubes ?? []).map((c) => bounds(c)[4]))).toBe(
          9,
        );
    }
  });
  it("closes both fly end panels up to the arch's inner surface", () => {
    const fly = geometry().bones.find((b: Bone) => b.name === "fly");
    for (const z of [7, -135]) {
      const strips = (fly.cubes as Cube[]).filter(
        (c) => c.origin[2] === z && c.size[0] === 1 && !c.rotation,
      );
      for (let x = -52; x < 52; x++) {
        const strip = strips.find((c) => c.origin[0] === x);
        const edge = Math.min(Math.abs(x), Math.abs(x + 1));
        const inner = 32 + 39 * Math.sqrt(1 - (edge / 52) ** 2);
        expect(strip, `x=${x} z=${z}`).toBeDefined();
        expect((strip?.origin[1] ?? 0) + (strip?.size[1] ?? 0)).toBeCloseTo(
          inner,
          2,
        );
        // Over the front door the binding fills y 32..33 instead.
        expect(strip?.origin[1]).toBe(z === -135 && x >= -8 && x < 8 ? 33 : 32);
      }
    }
  });
  it("keeps the fixed twelve swatches, including alpha-zero emissive glass", () => {
    const png = readFileSync(`${RP}/textures/entity/yasu_ride/tent.png`);
    expect([
      png.readUInt32BE(16),
      png.readUInt32BE(20),
      png[24],
      png[25],
    ]).toEqual([16, 16, 8, 6]);
    const chunks: Buffer[] = [];
    for (let at = 8; at < png.length; ) {
      const size = png.readUInt32BE(at);
      if (png.toString("ascii", at + 4, at + 8) === "IDAT")
        chunks.push(png.subarray(at + 8, at + 8 + size));
      at += size + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks));
    const palette = [
      [176, 140, 98, 255],
      [136, 104, 68, 255],
      [236, 234, 226, 255],
      [204, 202, 194, 255],
      [170, 174, 180, 255],
      [120, 124, 130, 255],
      [24, 24, 24, 255],
      [196, 198, 202, 255],
      [240, 240, 236, 255],
      [226, 222, 206, 0],
      [64, 86, 120, 255],
      [44, 60, 86, 255],
    ];
    for (let y = 0; y < 16; y++) {
      expect(raw[y * 65]).toBe(0);
      for (let x = 0; x < 16; x++)
        expect([
          ...raw.subarray(y * 65 + 1 + x * 4, y * 65 + 5 + x * 4),
        ]).toEqual(
          palette[Math.floor(y / 4) * 4 + Math.floor(x / 4)] ?? [0, 0, 0, 0],
        );
    }
  });
});
describe("tent item", () => {
  it("has a single-stack icon and closes the Camping Gear group", () => {
    const item = readJson(`${BP}/items/yasu_ride/tent_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description).toEqual({
      identifier: TENT_ITEM,
      menu_category: { category: "items" },
    });
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_tent_item",
      "minecraft:max_stack_size": 1,
      "minecraft:display_name": { value: `item.${TENT_ITEM}.name` },
    });
    const icon = readJson(`${RP}/textures/item_texture.json`).texture_data
      .yasu_ride_tent_item.textures;
    expect(icon).toBe("textures/items/yasu_ride/tent_item");
    expect(existsSync(`${RP}/${icon}.png`)).toBe(true);
    const groups = readJson(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories.flatMap((c: { groups: { items: string[] }[] }) => c.groups);
    expect(
      groups
        .find((g: { items: string[] }) => g.items.includes(TENT_ITEM))
        .items.at(-1),
    ).toBe(TENT_ITEM);
  });
  it("uses the specified wool, stick, and string recipe", () => {
    const r = readJson(`${BP}/recipes/yasu_ride/tent_item.recipe.json`);
    expect(r).toEqual({
      format_version: "1.20.10",
      "minecraft:recipe_shaped": {
        description: { identifier: TENT_ITEM },
        tags: ["crafting_table"],
        unlock: { context: "AlwaysUnlocked" },
        pattern: [" W ", "WSW", "T T"],
        key: {
          W: { tag: "minecraft:wool" },
          S: { item: "minecraft:stick" },
          T: { item: "minecraft:string" },
        },
        result: { item: TENT_ITEM, count: 1 },
      },
    });
  });
  it.each(["en_US", "ja_JP"])("names the entity and item in %s", (locale) => {
    const lines = readFileSync(`${RP}/texts/${locale}.lang`, "utf8").split(
      /\r?\n/,
    );
    for (const key of [`item.${TENT_ITEM}.name`, `entity.${TENT_TYPE}.name`]) {
      const value = lines
        .find((l) => l.startsWith(`${key}=`))
        ?.slice(key.length + 1);
      expect(value).toBeTruthy();
      if (locale === "en_US") expect(value).toBe("Tent");
    }
  });
});

describe("tent shelter blocks (ADR 0131)", () => {
  const blockOf = (name: string) =>
    readJson(`${BP}/blocks/yasu_ride/${name}.block.json`)["minecraft:block"];

  it("plates each wall face as the camper's wall does, selectable from outside", () => {
    const wall = blockOf("tent_wall");
    expect(wall.description.identifier).toBe(TENT_WALL_BLOCK);
    expect(wall.description.states).toEqual({
      [TENT_FACE_STATE]: [0, 1, 2, 3],
    });
    expect(wall.components).not.toHaveProperty(["minecraft:selection_box"]);
    const plates = [
      [
        [-8, 0, -8],
        [16, 16, 2],
      ],
      [
        [-8, 0, 6],
        [16, 16, 2],
      ],
      [
        [6, 0, -8],
        [2, 16, 16],
      ],
      [
        [-8, 0, -8],
        [2, 16, 16],
      ],
    ];
    expect(wall.permutations).toHaveLength(4);
    plates.forEach(([origin, size], face) => {
      const p = wall.permutations[face];
      expect(p.condition).toBe(
        `q.block_state('${TENT_FACE_STATE}') == ${face}`,
      );
      expect(p.components["minecraft:collision_box"]).toEqual({ origin, size });
      expect(p.components["minecraft:selection_box"]).toEqual(
        p.components["minecraft:collision_box"],
      );
    });
  });

  it("puts the ceiling plate at the bottom of its cell, faintly lit", () => {
    const ceiling = blockOf("tent_ceiling");
    expect(ceiling.description.identifier).toBe(TENT_CEILING_BLOCK);
    expect(ceiling.description).not.toHaveProperty("states");
    const plate = { origin: [-8, 0, -8], size: [16, 3, 16] };
    expect(ceiling.components["minecraft:collision_box"]).toEqual(plate);
    expect(ceiling.components["minecraft:selection_box"]).toEqual(plate);
    expect(ceiling.components["minecraft:light_emission"]).toBe(
      TENT_SPEC.ceilingLight,
    );
  });

  it("fills a closed flap's cell to keep mobs out, and lets an open one through while a tap still lands (ADR 0132)", () => {
    const flap = blockOf("tent_flap");
    expect(flap.description.identifier).toBe(TENT_FLAP_BLOCK);
    expect(flap.description.states).toEqual({
      [TENT_OPEN_STATE]: [false, true],
    });
    expect(flap.components["minecraft:custom_components"]).toEqual([
      TENT_FLAP_COMPONENT,
    ]);
    const cell = { origin: [-8, 0, -8], size: [16, 16, 16] };
    expect(flap.permutations).toEqual([
      {
        condition: `q.block_state('${TENT_OPEN_STATE}') == false`,
        components: {
          "minecraft:selection_box": cell,
          "minecraft:collision_box": cell,
        },
      },
      {
        condition: `q.block_state('${TENT_OPEN_STATE}') == true`,
        components: {
          "minecraft:selection_box": cell,
          "minecraft:collision_box": false,
        },
      },
    ]);
  });

  it.each(["tent_wall", "tent_ceiling", "tent_flap"])(
    "makes %s indestructible and see-through",
    (name) => {
      const c = blockOf(name).components;
      expect(c["minecraft:destructible_by_mining"]).toBe(false);
      expect(c["minecraft:destructible_by_explosion"]).toBe(false);
      expect(c["minecraft:light_dampening"]).toBe(0);
    },
  );

  it("keeps the entity's hidden box and hit test in its base components", () => {
    const e = readJson(`${BP}/entities/yasu_ride/tent.se.json`)[
      "minecraft:entity"
    ];
    expect(e.components["minecraft:collision_box"]).toEqual({
      width: 0.2,
      height: 0.2,
    });
    expect(e.components["minecraft:custom_hit_test"]).toEqual({
      hitboxes: [{ width: 0.1, height: 0.1, pivot: [0, 0.05, 0] }],
    });
    expect(e.component_groups ?? {}).toEqual({});
  });

  it("keeps every model cube within the footprint, x -56..56 and z -184..8 px", () => {
    for (const bone of geometry().bones as Bone[])
      for (const cube of bone.cubes ?? []) {
        const b = bounds(cube);
        expect(b[0]).toBeGreaterThanOrEqual(-56.002);
        expect(b[3]).toBeLessThanOrEqual(56.002);
        expect(b[2]).toBeGreaterThanOrEqual(-184.002);
        expect(b[5]).toBeLessThanOrEqual(8.002);
      }
  });

  it.each(["en_US", "ja_JP"])(
    "has every pitch and hit message in %s",
    (locale) => {
      const lines = readFileSync(`${RP}/texts/${locale}.lang`, "utf8").split(
        /\r?\n/,
      );
      const valueFor = (key: string) =>
        lines.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
      for (const key of [
        ...Object.values(PITCH_REFUSAL_MESSAGE),
        TENT_HITS_LEFT_HINT,
        TENT_OCCUPIED_HINT,
        FLAP_BLOCKED_HINT,
      ])
        expect(valueFor(key), key).toBeTruthy();
      expect(valueFor(TENT_HITS_LEFT_HINT)).toContain("%s");
      expect(valueFor(PITCH_REFUSAL_MESSAGE.limit)).toContain("%s");
    },
  );
});
