import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAIR_KIND_BY_ITEM,
  CHAIR_KIND_BY_TEST_EVENT,
  CHAIR_KIND_BY_TYPE,
  CHAIR_KINDS,
} from "../../src/infrastructure/camp/identifiers";
import { assertOneAxis } from "./oneAxis";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const profile = CHAIR_KINDS.noga_chair;
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Vec = [number, number, number];
type Cube = {
  origin: Vec;
  size: Vec;
  pivot?: Vec;
  rotation?: Vec;
  uv: Record<string, { uv: number[] }>;
};
const geo = read(`${RP}/models/entity/yasu_ride/noga_chair.geo.json`)[
  "minecraft:geometry"
][0];
const cubes: Cube[] = geo.bones[0].cubes;
const color = (c: Cube, u: number, v: number) =>
  c.uv.north?.uv[0] === u && c.uv.north?.uv[1] === v;
const back = cubes.filter(
  (c) =>
    c.pivot &&
    (Math.abs(c.size[0] - 1.16) < 1e-6 || color(c, 12, 4)) &&
    (color(c, 0, 0) || color(c, 4, 0) || color(c, 12, 4)),
);
const seats = cubes.filter(
  (c) => Math.abs(c.size[0] - 10.3) < 1e-6 && c.rotation?.[0],
);
const joint = cubes.filter((c) => Math.abs(c.size[0] - 10.28) < 1e-6);
const poles = cubes.filter((c) => color(c, 12, 0));
const feet = cubes.filter((c) => color(c, 4, 4));
const topCenter = (c: Cube): Vec => {
  const pts = corners(c);
  return [0, 1, 2].map(
    (a) => [2, 3, 6, 7].reduce((sum, i) => sum + (pts[i]?.[a] ?? 0), 0) / 4,
  ) as Vec;
};
const entity = read(`${BP}/entities/yasu_ride/noga_chair.se.json`)[
  "minecraft:entity"
];
const lang = (locale: string, key: string) =>
  readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1);

// Game convention: x and z have reversed signs, with x then y then z (ADR 0167).
function corners(cube: Cube): Vec[] {
  const [rx, ry, rz] = (cube.rotation ?? [0, 0, 0]).map(
    (a) => (a * Math.PI) / 180,
  ) as Vec;
  const [px, py, pz] = cube.pivot ?? [0, 0, 0];
  const points: Vec[] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1]) {
        let x = cube.origin[0] + i * cube.size[0] - px;
        let y = cube.origin[1] + j * cube.size[1] - py;
        let z = cube.origin[2] + k * cube.size[2] - pz;
        [y, z] = [
          y * Math.cos(rx) + z * Math.sin(rx),
          -y * Math.sin(rx) + z * Math.cos(rx),
        ];
        [x, z] = [
          x * Math.cos(ry) + z * Math.sin(ry),
          -x * Math.sin(ry) + z * Math.cos(ry),
        ];
        [x, y] = [
          x * Math.cos(rz) + y * Math.sin(rz),
          -x * Math.sin(rz) + y * Math.cos(rz),
        ];
        points.push([x + px, y + py, z + pz]);
      }
  return points;
}

function surfaceZ(cube: Cube, x: number, y: number): number | undefined {
  const pts = corners(cube);
  const origin = pts[0];
  if (!origin) throw new Error("missing cube origin");
  let low = -Infinity;
  let high = Infinity;
  for (const [axis, index] of [4, 2, 1].entries()) {
    const end = pts[index];
    const size = cube.size[axis];
    if (!end || !size) throw new Error("degenerate sling strip");
    const unit = end.map((v, a) => (v - (origin[a] ?? 0)) / size);
    const base =
      (x - origin[0]) * (unit[0] ?? 0) +
      (y - origin[1]) * (unit[1] ?? 0) -
      origin[2] * (unit[2] ?? 0);
    const direction = unit[2] ?? 0;
    if (Math.abs(direction) < 1e-9) {
      if (base < -1e-9 || base > size + 1e-9) return undefined;
    } else {
      const a = -base / direction;
      const b = (size - base) / direction;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
  }
  return high >= low ? high : undefined;
}

function poleSamples(cube: Cube): { t: number; point: Vec }[] {
  const pts = corners(cube);
  const result: { t: number; point: Vec }[] = [];
  for (let step = 0; step <= 40; step++) {
    const t = step / 40;
    for (const u of [0, 0.5, 1])
      for (const v of [0, 0.5, 1]) {
        const point = [0, 1, 2].map((a) => {
          const weights = [(1 - u) * (1 - v), (1 - u) * v, u * (1 - v), u * v];
          const bottom = [0, 1, 4, 5].reduce(
            (sum, i, j) => sum + (pts[i]?.[a] ?? 0) * (weights[j] ?? 0),
            0,
          );
          const top = [2, 3, 6, 7].reduce(
            (sum, i, j) => sum + (pts[i]?.[a] ?? 0) * (weights[j] ?? 0),
            0,
          );
          return bottom * (1 - t) + top * t;
        }) as Vec;
        result.push({ t, point });
      }
  }
  return result;
}

describe("Noga Chair (ADR 0169)", () => {
  it("routes its item, entity, and test event through the chair profile", () => {
    expect(profile).toEqual({
      typeId: "yasu_ride:noga_chair",
      itemId: "yasu_ride:noga_chair_item",
      family: "yasu_ride_noga_chair",
      hitsHint: "yasu_ride.hint.noga_chair_hits",
      testHitEvent: "yasu_ride_test:test_noga_chair_hit",
    });
    for (const [map, key] of [
      [CHAIR_KIND_BY_TYPE, profile.typeId],
      [CHAIR_KIND_BY_ITEM, profile.itemId],
      [CHAIR_KIND_BY_TEST_EVENT, profile.testHitEvent],
    ] as const)
      expect(map.get(key)).toBe("noga_chair");
  });

  it("provides a persistent, damage-proof one-player seat with gravity", () => {
    expect(entity.description).toEqual({
      identifier: profile.typeId,
      is_spawnable: false,
      is_summonable: true,
    });
    const c = entity.components;
    expect(c["minecraft:type_family"].family).toEqual([
      profile.family,
      "inanimate",
    ]);
    expect(c["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
      seats: [{ position: [0, 0.04, 0.21] }],
    });
    expect(c["minecraft:collision_box"]).toEqual({ width: 0.8, height: 0.9 });
    expect(c["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
    expect(c["minecraft:persistent"]).toEqual({});
  });

  it("connects the root geometry, texture, preview, and icon", () => {
    const client = read(`${RP}/entity/yasu_ride/noga_chair.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe(profile.typeId);
    expect(client.geometry.default).toBe("geometry.yasu_ride.noga_chair");
    expect(geo.description.identifier).toBe(client.geometry.default);
    expect(client.render_controllers).toEqual(["controller.render.default"]);
    expect(geo.bones.map((bone: { name: string }) => bone.name)).toEqual([
      "root",
    ]);
    expect(existsSync(`${RP}/${client.textures.default}.png`)).toBe(true);
    expect(existsSync("docs/images/items/camping-gear/noga_chair.png")).toBe(
      true,
    );
    expect(cubes.length).toBeLessThan(250);
  });

  it("limits compound turns to the back sling and eight registered poles", () => {
    expect(back).toHaveLength(33);
    expect(poles).toHaveLength(8);
    const assemblies = Object.fromEntries(
      poles.map((p, i) => [`pole_${i}`, [p]]),
    );
    expect(() =>
      assertOneAxis(cubes, { back_sling: back, ...assemblies }),
    ).not.toThrow();
    expect(() => assertOneAxis(cubes, assemblies)).toThrow();
  });

  it("keeps transformed corners inside the cell and rubber feet on the ground", () => {
    for (const [x, y, z] of cubes.flatMap(corners)) {
      expect(x).toBeGreaterThanOrEqual(-7.5);
      expect(x).toBeLessThanOrEqual(7.5);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(16);
      expect(z).toBeGreaterThanOrEqual(-8);
      expect(z).toBeLessThanOrEqual(8);
    }
    expect(feet).toHaveLength(4);
    for (const foot of feet)
      expect(Math.min(...corners(foot).map((p) => p[1]))).toBe(0);
    expect(feet.filter((c) => topCenter(c)[2] < 0)).toHaveLength(2);
    expect(feet.filter((c) => topCenter(c)[2] > 0)).toHaveLength(2);
  });

  it("keeps both back poles behind the sling surface, including their front edges", () => {
    const rearPoles = poles.filter(
      (c) => c.pivot?.[1] === 3.8 && (c.pivot?.[2] ?? 0) > 2,
    );
    const fabric = back.filter((c) => color(c, 0, 0));
    expect(rearPoles).toHaveLength(2);
    expect(fabric).toHaveLength(11);
    for (const pole of rearPoles) {
      let checks = 0;
      for (const {
        t,
        point: [x, y, z],
      } of poleSamples(pole)) {
        const surfaces = fabric
          .map((c) => surfaceZ(c, x, y))
          .filter((z): z is number => z !== undefined);
        if (surfaces.length && t < 0.95) {
          expect(z - Math.max(...surfaces)).toBeGreaterThanOrEqual(0.3);
          checks++;
        }
      }
      expect(checks).toBeGreaterThanOrEqual(150);
    }
  });

  it("spreads the straight legs to a wide footprint at 40 to 50 degrees in side view", () => {
    const legs = poles.filter((c) => c.pivot?.[1] === 0.55);
    expect(legs).toHaveLength(4);
    for (const foot of feet) {
      const [x, , z] = topCenter(foot);
      expect(Math.abs(x)).toBeCloseTo(5);
      expect(Math.abs(z)).toBeCloseTo(4.5);
    }
    for (const leg of legs) {
      const start = leg.pivot;
      const end = topCenter(leg);
      if (!start) throw new Error("missing leg pivot");
      const angle =
        (Math.atan2(Math.abs(end[2] - start[2]), end[1] - start[1]) * 180) /
        Math.PI;
      expect(angle).toBeGreaterThanOrEqual(40);
      expect(angle).toBeLessThanOrEqual(50);
      expect(end[1]).toBeCloseTo(4.35);
    }
  });

  it("builds a cross hub and a broad pocket with a rounded bottom and forward flap", () => {
    const hub = cubes.filter((c) => color(c, 0, 4));
    expect(hub).toHaveLength(2);
    expect(hub.every((c) => !c.rotation)).toBe(true);
    const pocket = cubes.filter(
      (c) => color(c, 0, 0) && c.origin[1] < 2.1 && c.origin[2] > 2,
    );
    expect(pocket.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...pocket.map((c) => c.size[0]))).toBeCloseTo(8.8);
    expect(Math.min(...pocket.flatMap(corners).map((p) => p[1]))).toBeCloseTo(
      1.3,
    );
    const flap = cubes.find((c) => color(c, 8, 0));
    expect(flap?.size[0]).toBeCloseTo(8.9);
    expect(flap?.rotation).toEqual([8, 0, 0]);
  });

  it("drops eight seat strips into the low rear joint and reclines the bound back", () => {
    expect(seats).toHaveLength(8);
    const points = seats.flatMap(corners);
    const front = Math.max(
      ...points.filter((p) => p[2] < -5.5).map((p) => p[1]),
    );
    expect(joint).toHaveLength(3);
    const rear = Math.min(
      ...[...seats, ...joint].flatMap((c) => {
        const pts = corners(c);
        return [2, 3, 6, 7].map((i) => pts[i]?.[1] ?? Infinity);
      }),
    );
    expect(front).toBeGreaterThanOrEqual(6);
    expect(front).toBeLessThanOrEqual(7.5);
    expect(rear).toBeGreaterThanOrEqual(3.5);
    expect(rear).toBeLessThanOrEqual(4.8);
    expect(front - rear).toBeGreaterThanOrEqual(2.5);
    for (const c of back) {
      const pts = corners(c);
      expect(
        [2, 3, 6, 7].reduce((s, i) => s + (pts[i]?.[2] ?? 0), 0),
      ).toBeGreaterThan(
        [0, 1, 4, 5].reduce((s, i) => s + (pts[i]?.[2] ?? 0), 0),
      );
    }
    const highest = (cs: Cube[]) =>
      Math.max(...cs.flatMap(corners).map((p) => p[1]));
    expect(highest(back.filter((c) => color(c, 4, 0)))).toBe(highest(back));
  });

  it("forms the measured A-B-C frame triangle above the crossed legs", () => {
    const frame = poles.filter(
      (c) => c.pivot?.[1] === 3.8 && (c.pivot?.[0] ?? 0) < 0,
    );
    const ends = frame.map(topCenter).sort((a, b) => a[2] - b[2]);
    const a = ends[0];
    const c = ends[1];
    if (!a || !c) throw new Error("missing frame triangle");
    const u = [a[1] - 3.8, a[2]];
    const v = [c[1] - 3.8, c[2]];
    const angle =
      (Math.acos(
        ((u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0)) /
          (Math.hypot(...u) * Math.hypot(...v)),
      ) *
        180) /
      Math.PI;
    expect(angle).toBeGreaterThanOrEqual(95);
    expect(angle).toBeLessThanOrEqual(115);
    expect(
      (Math.atan2(a[1] - 3.8, -a[2]) * 180) / Math.PI,
    ).toBeGreaterThanOrEqual(25);
    expect((Math.atan2(a[1] - 3.8, -a[2]) * 180) / Math.PI).toBeLessThanOrEqual(
      40,
    );
    expect(
      (Math.atan2(c[2], c[1] - 3.8) * 180) / Math.PI,
    ).toBeGreaterThanOrEqual(25);
    expect((Math.atan2(c[2], c[1] - 3.8) * 180) / Math.PI).toBeLessThanOrEqual(
      40,
    );
  });

  it("has a stackable item and its own icon, directly after the Low Chair", () => {
    const item = read(`${BP}/items/yasu_ride/noga_chair_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(profile.itemId);
    expect(item.components["minecraft:max_stack_size"]).toBe(16);
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_noga_chair_item");
    const icon = read(`${RP}/textures/item_texture.json`).texture_data
      .yasu_ride_noga_chair_item.textures;
    expect(icon).toBe("textures/items/yasu_ride/noga_chair_item");
    expect(existsSync(`${RP}/${icon}.png`)).toBe(true);
    const groups = read(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories.flatMap((c: { groups: { items: string[] }[] }) => c.groups);
    const group = groups.find((g: { items: string[] }) =>
      g.items.includes(profile.itemId),
    );
    expect(group.items.slice(0, 2)).toEqual([
      CHAIR_KINDS.low_chair.itemId,
      profile.itemId,
    ]);
  });

  it("uses a distinct wool-and-iron recipe", () => {
    const recipe = read(`${BP}/recipes/yasu_ride/noga_chair_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.pattern).toEqual(["WW ", "WIW", "I I"]);
    expect(recipe.key).toEqual({
      W: { tag: "minecraft:wool" },
      I: { item: "minecraft:iron_ingot" },
    });
    expect(recipe.result).toEqual({ item: profile.itemId, count: 1 });
    for (const other of ["low_chair", "tent"])
      expect(recipe.pattern).not.toEqual(
        read(`${BP}/recipes/yasu_ride/${other}_item.recipe.json`)[
          "minecraft:recipe_shaped"
        ].pattern,
      );
  });

  it.each(["en_US", "ja_JP"])(
    "names the chair and its fold hint in %s",
    (locale) => {
      for (const key of [
        `entity.${profile.typeId}.name`,
        `item.${profile.itemId}.name`,
        "action.interact.yasu_ride.sit",
      ])
        expect(lang(locale, key)).toBeTruthy();
      expect(lang(locale, profile.hitsHint)).toContain("%s");
      if (locale === "en_US")
        expect(lang(locale, `item.${profile.itemId}.name`)).toBe("Noga Chair");
    },
  );

  it("ships RP 0.1.185 and matches the BP dependency", () => {
    const rp = read(`${RP}/manifest.json`);
    expect(rp.header.version).toEqual([0, 1, 185]);
    expect(rp.modules[0].version).toEqual(rp.header.version);
    expect(
      read(`${BP}/manifest.json`).dependencies.find(
        (d: { uuid?: string }) => d.uuid === rp.header.uuid,
      ).version,
    ).toEqual(rp.header.version);
  });
});
