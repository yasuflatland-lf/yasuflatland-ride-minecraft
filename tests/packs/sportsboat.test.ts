import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { SPORTSBOAT_PROFILE } from "../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  PAINT_VARIANT,
  paintEvent,
} from "../../src/infrastructure/shared/dyes";
import {
  HEADLIGHTS_PROPERTY,
  SEAT_FILLER_FAMILY,
  VEHICLE_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { readRgbaPng } from "../support/png";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const RP = "packs/yasu_ride_rp";
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json")[
  "minecraft:entity"
];
const c = entity.components;
const client = read(`${RP}/entity/yasu_ride/sportsboat.ce.json`)[
  "minecraft:client_entity"
].description;
const controller = read(`${RP}/render_controllers/yasu_ride/sportsboat.rc.json`)
  .render_controllers["controller.render.yasu_ride.sportsboat"];
const geometry = read(`${RP}/models/entity/yasu_ride/sportsboat.geo.json`)[
  "minecraft:geometry"
][0];

describe("sports boat Behavior Pack entity (ADR 0051)", () => {
  it("has a collision box 2.2 wide and 1.2 high", () => {
    expect(c["minecraft:collision_box"]).toEqual({ width: 2.2, height: 1.2 });
  });

  it("has three hit boxes along the 6-block hull, since hits outside the square collision box miss", () => {
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual(
      [-1.6, 0, 1.6].map((z) => ({
        width: 2.2,
        height: 1.4,
        pivot: [0, 0.7, z],
      })),
    );
  });

  it("floats with minecraft:buoyant, gravity on and no waves", () => {
    expect(c["minecraft:buoyant"]).toEqual({
      base_buoyancy: 1.0,
      apply_gravity: true,
      simulate_waves: false,
      big_wave_probability: 0,
      liquid_blocks: [
        "minecraft:water",
        "minecraft:flowing_water",
        "minecraft:lava",
        "minecraft:flowing_lava",
      ],
    });
    expect(c["minecraft:fire_immune"]).toEqual({});
  });

  it("seat x and z and their order match SPORTSBOAT_PROFILE.seats.positions, every seat 0.52 up, with the driver in seat 0", () => {
    const rideable = c["minecraft:rideable"];
    const seats: { position: number[] }[] = rideable.seats;
    expect(rideable.controlling_seat).toBe(0);
    // Seat fillers hold the free seats below a chosen one (ADR 0120).
    expect(rideable.family_types).toEqual(["player", SEAT_FILLER_FAMILY]);
    expect(rideable.crouching_skip_interact).toBe(true);
    expect(seats).toHaveLength(SPORTSBOAT_PROFILE.seats.positions.length);
    expect(seats.map((s) => [s.position[0], s.position[2]])).toEqual(
      SPORTSBOAT_PROFILE.seats.positions.map((p) => [p.x, p.z]),
    );
    expect(seats.map((s) => s.position[1])).toEqual(seats.map(() => 0.52));
    // A boarding player's line of sight picks the seat at the riders' height (ADR 0120).
    expect(SPORTSBOAT_SPEC.seatAimHeight).toBe(0.52);
    // Each seat's aim ball reaches halfway to the seat beside it.
    const [left, right] = SPORTSBOAT_PROFILE.seats.positions;
    expect(SPORTSBOAT_SPEC.seatAimRadius).toBeCloseTo(
      Math.abs((left?.x ?? 0) - (right?.x ?? 0)) / 2,
      9,
    );
    expect(rideable.seats[0].lock_rider_rotation).toBe(90);
  });

  it("is in the vehicle family, so the script's family query finds it", () => {
    expect(c["minecraft:type_family"].family).toEqual([
      VEHICLE_FAMILY,
      "inanimate",
    ]);
  });

  it("takes no damage (ADR 0006)", () => {
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
  });

  it("each paint event sets that paint's variant and drops the other paints", () => {
    expect(c["minecraft:variant"].value).toBe(0);
    expect(Object.keys(entity.component_groups).sort()).toEqual(
      [
        ...PAINTS.map((p) => `yasu_ride:paint_${p}`),
        "yasu_ride:docked",
        "yasu_ride:undocked",
      ].sort(),
    );
    expect(Object.keys(entity.events).sort()).toEqual(
      [...PAINTS.map(paintEvent), "yasu_ride:dock", "yasu_ride:undock"].sort(),
    );
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

  it("defaults to undocked with headlights off and level attitude, syncing only the visual properties", () => {
    expect(entity.description.properties).toEqual({
      "yasu_ride:docked": {
        type: "bool",
        default: false,
        client_sync: false,
      },
      [HEADLIGHTS_PROPERTY]: {
        type: "bool",
        default: false,
        client_sync: true,
      },
      "yasu_ride:trim": {
        type: "float",
        range: [0, 3.5],
        default: 0,
        client_sync: true,
      },
      "yasu_ride:roll": {
        type: "float",
        range: [-20, 20],
        default: 0,
        client_sync: true,
      },
    });
  });

  it("disables collision and gravity on dock and restores physics on undock (ADR 0063)", () => {
    expect(c["minecraft:physics"]).toEqual({});
    expect(entity.component_groups["yasu_ride:docked"]).toEqual({
      "minecraft:physics": { has_collision: false, has_gravity: false },
    });
    // Removing a group that overrides a base component removes the component (ADR 0063).
    expect(entity.component_groups["yasu_ride:undocked"]).toEqual({
      "minecraft:physics": {},
    });
    expect(entity.events["yasu_ride:dock"]).toEqual({
      remove: { component_groups: ["yasu_ride:undocked"] },
      add: { component_groups: ["yasu_ride:docked"] },
    });
    expect(entity.events["yasu_ride:undock"]).toEqual({
      remove: { component_groups: ["yasu_ride:docked"] },
      add: { component_groups: ["yasu_ride:undocked"] },
    });
  });

  it("is crafted on a crafting table from an oak boat and iron ingots, unlocked from the start (ADR 0008)", () => {
    const item = read(
      "packs/yasu_ride_bp/items/yasu_ride/sportsboat_item.item.json",
    )["minecraft:item"];
    expect(item.description.identifier).toBe("yasu_ride:sportsboat_item");
    const recipe = read(
      "packs/yasu_ride_bp/recipes/yasu_ride/sportsboat_item.recipe.json",
    )["minecraft:recipe_shaped"];
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
    expect(recipe.pattern).toEqual(["IBI", "III"]);
    expect(recipe.key).toEqual({
      I: { item: "minecraft:iron_ingot" },
      B: { item: "minecraft:oak_boat" },
    });
    expect(recipe.result).toEqual({
      item: "yasu_ride:sportsboat_item",
      count: 1,
    });
  });
});

describe("sports boat attitude and wake (ADR 0059)", () => {
  const animations = read(
    `${RP}/animations/yasu_ride/sportsboat.anim.json`,
  ).animations;

  // In game a positive x rotation of the root lowered the bow, so the trim is negated (ADR 0061).
  it("turns the root bone by minus the trim on x and minus the roll on z in one always-on animation", () => {
    expect(client.animations.attitude).toBe(
      "animation.yasu_ride.sportsboat.attitude",
    );
    expect(client.scripts.animate).toContain("attitude");
    expect(animations["animation.yasu_ride.sportsboat.attitude"].bones).toEqual(
      {
        root: {
          rotation: [
            "-query.property('yasu_ride:trim')",
            0,
            "-query.property('yasu_ride:roll')",
          ],
        },
      },
    );
  });

  it("puts the root pivot in the aft third at the waterline", () => {
    const root = geometry.bones.find(
      (b: { name: string }) => b.name === "root",
    );
    expect(root.pivot).toEqual([0, 7, 20]);
  });

  it("emits bubbles and foam from both jet nozzles while ridden faster than 2 blocks a second", () => {
    expect(client.scripts.animate).toContainEqual({
      wake: "query.has_rider && query.ground_speed > 2",
    });
    const effects = Object.values(
      animations["animation.yasu_ride.sportsboat.wake"].particle_effects,
    ).flat() as { effect: string; locator: string }[];
    const body = geometry.bones.find(
      (b: { name: string }) => b.name === "body",
    );
    for (const effect of ["jet_bubbles", "jet_foam"]) {
      const particle = read(
        `${RP}/particles/yasu_ride/${effect}.particle.json`,
      ).particle_effect;
      expect(client.particle_effects[effect]).toBe(
        particle.description.identifier,
      );
      expect(
        effects.filter((e) => e.effect === effect).map((e) => e.locator),
      ).toEqual(["jet_left", "jet_right"]);
    }
    expect(Object.keys(body.locators).sort()).toEqual([
      "jet_left",
      "jet_right",
    ]);
  });
});

describe("sports boat Resource Pack (ADR 0051)", () => {
  it("the client entity draws the sports boat geometry with the sports boat render controller", () => {
    expect(geometry.description.identifier).toBe(
      "geometry.yasu_ride.sportsboat",
    );
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.sportsboat",
    });
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.sportsboat",
      "controller.render.yasu_ride.sportsboat.mirror",
      {
        "controller.render.yasu_ride.sportsboat.lit":
          "query.property('yasu_ride:headlights')",
      },
    ]);
  });

  it("picks one of 16 paint textures by variant, black (variant 0) as sportsboat.png", () => {
    expect(controller.textures).toEqual(["Array.paints[query.variant]"]);
    const slots: string[] = controller.arrays.textures["Array.paints"];
    expect(slots).toHaveLength(PAINTS.length);
    for (const paint of PAINTS) {
      const key = slots[PAINT_VARIANT[paint]]?.replace("Texture.", "") ?? "";
      const path = client.textures[key];
      expect(path, paint).toBe(
        paint === "khaki"
          ? "textures/entity/yasu_ride/sportsboat"
          : `textures/entity/yasu_ride/sportsboat_${paint}`,
      );
      expect(existsSync(`${RP}/${path}.png`), path).toBe(true);
    }
  });

  it("draws the windshield with the alpha-blended glass material", () => {
    expect(controller.materials).toContainEqual({
      windshield: "Material.glass",
    });
    expect(client.materials.glass).toBe("entity_alphablend");
  });

  describe("windshield glass (ADR 0158)", () => {
    type Cube = {
      origin: [number, number, number];
      size: [number, number, number];
      rotation?: [number, number, number];
    };
    const cubes: Cube[] = geometry.bones.find(
      (b: { name: string }) => b.name === "windshield",
    ).cubes;
    const tilt = (cube: Cube) => Math.abs(cube.rotation?.[0] ?? 0);
    const thickness = (cube: Cube) => Math.min(cube.size[0], cube.size[2]);

    it("is seven flat panes, each 0.5 px thick and tilted to its slope, so no stepped blocks remain", () => {
      expect(cubes).toHaveLength(7);
      for (const pane of cubes) {
        expect(tilt(pane)).toBeGreaterThan(5);
        expect(thickness(pane)).toBeCloseTo(0.5);
      }
    });

    it("lays the two front halves and the walk-through door on the 55-degree rake", () => {
      const front = cubes.filter((cube) => cube.size[2] === 0.5);
      expect(front).toHaveLength(3);
      for (const pane of front) {
        expect(tilt(pane)).toBeCloseTo(55.3, 1);
        expect(pane.size[1]).toBeCloseTo(7.9, 1);
      }
    });

    it("gives each side one pane along the gunwale and one corner pane under the rake", () => {
      const sides = cubes.filter((cube) => cube.size[0] === 0.5);
      expect(sides).toHaveLength(4);
      const gunwale = sides.filter((cube) => tilt(cube) < 10);
      expect(gunwale.map((cube) => Math.sign(cube.origin[0])).sort()).toEqual([
        -1, 1,
      ]);
      for (const pane of gunwale) expect(pane.size[2]).toBeGreaterThan(25);
      const corner = sides.filter((cube) => tilt(cube) > 10);
      for (const pane of corner) {
        expect(tilt(pane)).toBeCloseTo(55.3, 1);
        // Stops short of the top corner so its aft edge meets the side pane behind the corner post
        expect(pane.size[1]).toBeCloseTo(7.19, 2);
      }
    });

    it("frames the front glass with only the walk-through and corner posts, no dividers or corner pillars", () => {
      const body: Cube[] = geometry.bones.find(
        (b: { name: string }) => b.name === "body",
      ).cubes;
      const raked = body.filter((cube) => Math.abs(tilt(cube) - 55.3) < 0.1);
      expect(raked.map((cube) => cube.size[0]).sort()).toEqual([
        0.6, 0.6, 1.2, 1.2,
      ]);
      const alongSides = body.filter(
        (cube) => Math.abs(tilt(cube) - 7.1) < 0.1,
      );
      expect(alongSides.map((cube) => cube.size[1])).toEqual([0.7, 0.7]);
    });
  });

  it("names the bones root, body, headlights, windshield, and mirror (ADR 0009, 0159)", () => {
    expect(geometry.bones.map((b: { name: string }) => b.name)).toEqual([
      "root",
      "body",
      "headlights",
      "windshield",
      "mirror",
    ]);
  });
});

describe("sports boat hull planking (ADR 0161)", () => {
  type Cube = {
    origin: [number, number, number];
    size: [number, number, number];
    pivot?: [number, number, number];
    rotation?: [number, number, number];
    uv: Record<string, { uv: [number, number] }>;
  };
  const bone = (name: string): Cube[] =>
    geometry.bones.find((b: { name: string }) => b.name === name).cubes;
  const cubes = geometry.bones.flatMap(
    (b: { cubes?: Cube[] }) => b.cubes ?? [],
  ) as Cube[];
  // Each swatch is a 4-texel cell in palette order (tools/gen_sportsboat.py): hull is the 1st,
  // strake the 3rd, and stripe the 20th.
  const swatch = (index: number) => (cube: Cube) =>
    cube.uv.up?.uv[0] === index * 4 + 1;
  const isHull = swatch(0);
  const shell = cubes.filter(
    (cube) => isHull(cube) || swatch(2)(cube) || swatch(19)(cube),
  );
  // The plan stations and the half-breadth there (issue #640's table), bow at +z as the generator
  // builds it; the model is turned around, so the bow is at -z in the file.
  const STATIONS: [number, number][] = [
    [-48, 14.5],
    [-47, 15.86],
    [-46, 16.53],
    [-45, 16.87],
    [-44, 17.0],
    [8, 17.0],
    [12, 16.79],
    [16, 16.27],
    [18, 15.94],
    [20, 15.6],
    [23, 14.94],
    [26, 14.04],
    [29, 12.98],
    [32, 11.76],
    [34, 10.8],
    [36, 9.73],
    [38, 8.6],
    [40, 7.39],
    [42, 6.06],
    [44, 4.6],
    [45.5, 3.35],
    [47, 2.0],
    [48.5, 0.6],
  ];
  // SHEER in tools/gen_sportsboat.py
  const SHEER: [number, number][] = [
    [-48, 9.5],
    [-44, 11.5],
    [-40, 13],
    [-32, 15.5],
    [-21, 16.8],
    [0, 17.4],
    [22, 17.6],
    [38, 17.8],
    [48, 18.4],
  ];
  const lerp = (table: [number, number][], z: number) => {
    const i = table.findIndex(([z1]) => z <= z1);
    if (i <= 0) return (i === 0 ? table[0] : table.at(-1))?.[1] ?? 0;
    const [z0, v0] = table[i - 1] ?? [0, 0];
    const [z1, v1] = table[i] ?? [0, 0];
    return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
  };
  const KEEL: [number, number][] = [
    [-48, 7],
    [-44.5, 2.5],
    [-39, 0],
    [-10, 0],
    [16, 0.7],
    [28, 2.6],
    [37, 5.9],
    [43, 10.1],
    [46.5, 14.4],
    [48, 17.4],
  ];
  const vfrac = (height: number) =>
    lerp(
      [
        [0, 0.3],
        [1.5, 0.55],
        [3, 0.78],
        [4.5, 1],
      ],
      height,
    );
  const STRAKE_PROUD = 0.1;

  const turn = (v: number[], axis: "x" | "y", degrees: number) => {
    const [x = 0, y = 0, z = 0] = v;
    const s = Math.sin((degrees * Math.PI) / 180);
    const c = Math.cos((degrees * Math.PI) / 180);
    return axis === "x"
      ? [x, y * c - z * s, y * s + z * c]
      : [x * c + z * s, y, -x * s + z * c];
  };
  // The shipped SUV bumper chamfers anchor the y sign: +y turns +x toward -z.
  const interval = (cube: Cube, point: number[], direction: number[]) => {
    const [rx = 0, ry = 0] = cube.rotation ?? [];
    const pivot = cube.pivot ?? [0, 0, 0];
    const undo = (v: number[]) =>
      rx ? turn(v, "x", rx) : ry ? turn(v, "y", -ry) : v;
    const p = undo(point.map((v, i) => v - (pivot[i] ?? 0)));
    const d = undo(direction);
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    for (const i of [0, 1, 2] as const) {
      const a = cube.origin[i] - pivot[i];
      const b = a + cube.size[i];
      const pi = p[i] ?? 0;
      const di = d[i] ?? 0;
      if (Math.abs(di) < 1e-12) {
        if (pi < a || pi > b) return undefined;
        continue;
      }
      const t0 = (a - pi) / di;
      const t1 = (b - pi) / di;
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
    }
    return lo <= hi ? [lo, hi] : undefined;
  };
  const reach = (cube: Cube, y: number, z: number) => {
    const hit = interval(cube, [0, y, z], [1, 0, 0]);
    return hit ? Math.max(...hit.map(Math.abs)) : 0;
  };

  it("uses the shipped SUV bumper's inward y-turned corners", () => {
    const suv = read(`${RP}/models/entity/yasu_ride/suv.geo.json`)[
      "minecraft:geometry"
    ][0];
    const corners: Cube[] = suv.bones
      .flatMap((b: { cubes?: Cube[] }) => b.cubes ?? [])
      .filter(
        (cube: Cube) => cube.rotation?.[1] === 30 && cube.size[1] === 3.8,
      );
    expect(corners).toHaveLength(1);
    const corner = corners[0];
    expect(corner).toBeDefined();
    if (!corner) return;
    const z = corner.pivot?.[2] ?? 0;
    expect(reach(corner, 5, z - 0.1)).toBeLessThan(13);
    expect(reach(corner, 5, z + 1)).toBeGreaterThan(14);
  });

  it("intercepts vertical rays throughout the outer plan, including both stem gaps", () => {
    const hull = cubes.filter(isHull);
    const misses: string[] = [];
    for (let z = -47.875; z < 48.5; z += 0.125) {
      const width = lerp(STATIONS, z) - 0.15;
      for (const fraction of [0, 0.2, 0.5, 0.8, 0.98]) {
        for (const side of [-1, 1]) {
          const x = side * width * fraction;
          if (!hull.some((cube) => interval(cube, [x, 0, -z], [0, 1, 0])))
            misses.push(`${x.toFixed(3)},${z}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("keeps side rays on the V bands above the accepted stepped keel", () => {
    const hull = cubes.filter(isHull);
    for (let z = -47.875; z < 47; z += 0.25) {
      for (let y = 3; y < lerp(SHEER, z) - 2.75; y += 2) {
        if (y < lerp(KEEL, z) + 2) continue;
        const expected = lerp(STATIONS, z) * vfrac(y - lerp(KEEL, z));
        for (const side of [-1, 1]) {
          const hits = hull.flatMap(
            (cube) => interval(cube, [0, y, -z], [side, 0, 0])?.[1] ?? [],
          );
          const first = Math.max(...hits);
          // Mid-band chords can fall 0.98 px inside the V curve near a keel crossing.
          expect(first - expected, `${side},${y},${z}`).toBeGreaterThanOrEqual(
            -1.05,
          );
          expect(first - expected, `${side},${y},${z}`).toBeLessThanOrEqual(
            0.2,
          );
        }
      }
    }
    // Just below the stern sheer strake: the old deck protruded 1.1 px here.
    for (let z = -46.6; z <= -46.4; z += 0.05) {
      const expected = lerp(STATIONS, z) * vfrac(9 - lerp(KEEL, z));
      for (const y of [8.01, 8.05, 8.1]) {
        expect(
          Math.max(...hull.map((cube) => reach(cube, y, -z))) - expected,
        ).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it("embeds every lens back and limits normal standoff across the faces it spans", () => {
    const hull = cubes.filter(isHull);
    for (const lens of bone("headlights")) {
      const [px, py, pz] = lens.pivot ?? [0, 0, 0];
      const side = Math.sign(px);
      const angle = ((lens.rotation?.[1] ?? 0) * Math.PI) / 180;
      const cosine = Math.cos(angle);
      for (let j = 0; j <= 80; j++) {
        for (const fraction of [0.001, 0.25, 0.5, 0.75, 0.999]) {
          for (const back of [false, true]) {
            const x =
              lens.origin[0] + lens.size[0] * (side > 0 !== back ? 1 : 0);
            const point = turn(
              [x - px, 0, lens.origin[2] + (lens.size[2] * j) / 80 - pz],
              "y",
              lens.rotation?.[1] ?? 0,
            );
            const worldX = px + (point[0] ?? 0);
            const z = pz + (point[2] ?? 0);
            const y = lens.origin[1] + lens.size[1] * fraction;
            const face = Math.max(
              ...hull.flatMap(
                (cube) => interval(cube, [0, y, z], [side, 0, 0])?.[1] ?? [],
              ),
            );
            // A flat lens at its segment's yaw over merged planks cannot sit 0.15 proud everywhere;
            // the generator keeps it 0.03 to 0.2 px off the face (ADR 0161).
            const clearance = (side * worldX - face) * cosine;
            expect(
              clearance,
              `${px},${py},${pz},${j},${fraction},${back}`,
            ).toBeLessThanOrEqual(back ? -0.02 : 0.21);
            if (!back) expect(clearance).toBeGreaterThanOrEqual(0.025);
          }
        }
      }
    }
  });

  it("turns every hull, stripe, and strake cube about one axis at most, never z", () => {
    expect(shell.length).toBeGreaterThan(0);
    for (const cube of shell) {
      const [rx = 0, ry = 0, rz = 0] = cube.rotation ?? [];
      expect(rz).toBe(0);
      expect(rx !== 0 && ry !== 0).toBe(false);
    }
  });

  it("keeps the outer plan outline at the rub rail on the half-breadth table and never wider toward the bow", () => {
    const hull = cubes.filter(isHull);
    let previous = Number.POSITIVE_INFINITY;
    for (let z = -47.75; z <= 48.25; z += 0.25) {
      const y = lerp(SHEER, z) - 0.75;
      const outermost = Math.max(...hull.map((cube) => reach(cube, y, -z)));
      expect(
        Math.abs(outermost - lerp(STATIONS, z) - STRAKE_PROUD),
        `z ${z}`,
      ).toBeLessThanOrEqual(0.15);
      if (z >= 8) {
        expect(outermost, `z ${z}`).toBeLessThanOrEqual(previous + 1e-6);
        previous = outermost;
      }
    }
  });

  it("sets one lens per plan segment from z 32 to 42 on each side, turned with its segment", () => {
    const lenses = bone("headlights");
    expect(lenses).toHaveLength(10);
    const yaws = new Map(
      STATIONS.slice(0, -1).map(([z0, x0], i) => {
        const [z1 = 0, x1 = 0] = STATIONS[i + 1] ?? [];
        return [z0, (Math.atan2(x0 - x1, z1 - z0) * 180) / Math.PI];
      }),
    );
    const starts = [32, 34, 36, 38, 40];
    for (const lens of lenses) {
      // The lens pivots on its segment's aft end, moved a little outboard
      const z = -(lens.pivot?.[2] ?? 0);
      const start = starts.reduce((a, b) =>
        Math.abs(b - z) < Math.abs(a - z) ? b : a,
      );
      expect(Math.abs(z - start)).toBeLessThan(0.5);
      expect(
        Math.abs(
          (lens.rotation?.[1] ?? 0) -
            Math.sign(lens.pivot?.[0] ?? 0) * (yaws.get(start) ?? 0),
        ),
      ).toBeLessThanOrEqual(0.5);
    }
    expect(
      new Set(lenses.map((lens) => Math.round(-(lens.pivot?.[2] ?? 0)))).size,
    ).toBe(5);
  });

  describe("bow inner outline (ADR 0162)", () => {
    const LOUNGE_BASE = 13.2;

    it("keeps the piping inner V within 0.15 px of the inset plan and never wider toward the bow", () => {
      const piping = bone("body").filter(
        (cube) =>
          swatch(8)(cube) &&
          Math.abs(cube.origin[1] - LOUNGE_BASE) < 1e-4 &&
          Math.abs(cube.size[1] - 1.1) < 1e-4,
      );
      expect(piping).toHaveLength(18);
      for (const side of [-1, 1]) {
        let previous = Number.POSITIVE_INFINITY;
        for (let z = 18.25; z <= 39.5; z += 0.25) {
          const inner = Math.min(
            ...piping.flatMap((cube) => {
              const hit = interval(
                cube,
                [0, LOUNGE_BASE + 0.5, -z],
                [side, 0, 0],
              );
              const near = hit?.[0];
              return near !== undefined && near >= 0 ? [near] : [];
            }),
          );
          expect(
            Math.abs(inner - (lerp(STATIONS, z) - 7.5)),
            `${side},${z}`,
          ).toBeLessThanOrEqual(0.15);
          expect(inner, `${side},${z}`).toBeLessThanOrEqual(previous + 1e-6);
          previous = inner;
        }
      }
    });

    it("keeps every bow wall at DECK_BOW except the chord-limited stem segment", () => {
      const starts = [18, 20, 23, 26, 29, 32, 34, 36, 38];
      const walls = bone("body").filter((cube) => {
        const pivot = cube.pivot;
        return (
          isHull(cube) &&
          pivot !== undefined &&
          pivot[1] === 11 &&
          -pivot[2] >= 18 &&
          -pivot[2] < 40 &&
          cube.size[1] > 5
        );
      });
      expect(walls).toHaveLength(18);
      for (const start of starts) {
        const segment = walls.filter(
          (cube) => Math.round(-(cube.pivot?.[2] ?? 0)) === start,
        );
        expect(segment, `segment starting at ${start}`).toHaveLength(2);
        for (const wall of segment) {
          expect(wall.origin[1]).toBe(start === 38 ? 12 : 11);
          expect(wall.size[0]).toBeGreaterThanOrEqual(0.05);
        }
      }
    });

    it("turns every open-bow interior and bow-rail cube about y only", () => {
      // Glass and its frame retain their x rake under the windshield contract (ADR 0158).
      const bow = bone("body").filter((cube) => {
        const z = -(cube.pivot?.[2] ?? cube.origin[2] + cube.size[2] / 2);
        return (
          z >= 18 &&
          z <= 43 &&
          cube.origin[1] >= 11 &&
          [0, 7, 8, 9, 10, 16].some((index) => swatch(index)(cube))
        );
      });
      expect(bow.length).toBeGreaterThan(100);
      for (const cube of bow) {
        expect(cube.rotation?.[0] ?? 0).toBe(0);
        expect(cube.rotation?.[2] ?? 0).toBe(0);
      }
    });

    it("does not grow beyond 1166 cubes (regression guard)", () => {
      expect(cubes.length).toBeLessThanOrEqual(1166);
    });
  });
});

describe("sports boat PBR rear-view mirror (ADR 0159)", () => {
  const ENTITY_TEXTURES = `${RP}/textures/entity/yasu_ride`;
  const texels = (name: string) => {
    const { width, height, pixels } = readRgbaPng(
      `${ENTITY_TEXTURES}/${name}.png`,
    );
    const at = (x: number, y: number) => [
      ...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
    ];
    return { width, height, at };
  };
  // The tile the glass's aft face shows: a 1-texel rim around the glass.
  const TILE = { u: 16, v: 16, w: 16, h: 8 };
  // The mirror swatch is the palette's 24th 4-texel cell (tools/gen_sportsboat.py).
  const MIRROR_SWATCH = 23;
  const inGlass = (x: number, y: number) =>
    x > TILE.u &&
    x < TILE.u + TILE.w - 1 &&
    y > TILE.v &&
    y < TILE.v + TILE.h - 1;
  const brightness = ([r = 0, g = 0, b = 0]: number[]) => r + g + b;

  it("puts only the glass in the mirror bone, its aft (+z) face on the mirror tile", () => {
    const mirror = geometry.bones.find(
      (b: { name: string }) => b.name === "mirror",
    );
    expect(mirror.parent).toBe("body");
    expect(mirror.cubes).toHaveLength(1);
    expect(mirror.cubes[0].uv.south).toEqual({
      uv: [TILE.u, TILE.v],
      uv_size: [TILE.w, TILE.h],
    });
  });

  it("draws the mirror bone only in an always-on pass with the mirror texture", () => {
    const controllers = read(
      `${RP}/render_controllers/yasu_ride/sportsboat.rc.json`,
    ).render_controllers;
    expect(controller.part_visibility).toContainEqual({ mirror: false });
    expect(
      controllers["controller.render.yasu_ride.sportsboat.mirror"],
    ).toEqual({
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Texture.mirror"],
      part_visibility: [{ "*": false }, { mirror: true }],
    });
    expect(client.textures.mirror).toBe(
      "textures/entity/yasu_ride/sportsboat_mirror",
    );
    expect(client.materials.default).toBe("entity");
  });

  it("gives the mirror atlas a texture set that is metal 255, emissive 0, roughness 0 only on the glass", () => {
    expect(
      read(`${ENTITY_TEXTURES}/sportsboat_mirror.texture_set.json`),
    ).toEqual({
      format_version: "1.16.100",
      "minecraft:texture_set": {
        color: "sportsboat_mirror",
        metalness_emissive_roughness: "sportsboat_mirror_mer",
      },
    });
    const base = texels("sportsboat");
    const color = texels("sportsboat_mirror");
    const mer = texels("sportsboat_mirror_mer");
    expect([color.width, color.height, mer.width, mer.height]).toEqual([
      base.width,
      base.height,
      base.width,
      base.height,
    ]);
    for (let y = 0; y < base.height; y++)
      for (let x = 0; x < base.width; x++) {
        expect(color.at(x, y), `color ${x},${y}`).toEqual(base.at(x, y));
        const metal =
          (y < 4 && Math.floor(x / 4) === MIRROR_SWATCH) || inGlass(x, y);
        expect(mer.at(x, y), `MER ${x},${y}`).toEqual(
          metal ? [255, 0, 0, 255] : [0, 0, 255, 255],
        );
      }
  });

  it("bakes a dark-rimmed sky-to-horizon gradient into every paint for clients without PBR", () => {
    for (const paint of PAINTS) {
      const { at } = texels(
        paint === "khaki" ? "sportsboat" : `sportsboat_${paint}`,
      );
      const rows = Array.from({ length: TILE.h - 2 }, (_, i) =>
        at(TILE.u + 1, TILE.v + 1 + i),
      );
      for (const [i, row] of rows.entries()) {
        for (let x = TILE.u + 1; x < TILE.u + TILE.w - 1; x++)
          expect(at(x, TILE.v + 1 + i), paint).toEqual(row);
        expect(brightness(at(TILE.u, TILE.v + 1 + i))).toBeLessThan(
          brightness(row),
        );
      }
      for (const [i, row] of rows.slice(1).entries())
        expect(brightness(row), paint).toBeGreaterThan(
          brightness(rows[i] ?? []),
        );
      const [r = 0, , b = 0] = rows[0] ?? [];
      expect(b, "the sky row is bluish").toBeGreaterThan(r);
    }
  });
});

describe("sports boat engine sound (ADR 0060)", () => {
  const defs = read(`${RP}/sounds/sound_definitions.json`).sound_definitions;
  const animations = read(
    `${RP}/animations/yasu_ride/sportsboat.anim.json`,
  ).animations;
  const levels: Record<string, string>[] = client.scripts.animate.filter(
    (a: unknown) =>
      typeof a === "object" &&
      a !== null &&
      (Object.keys(a)[0] ?? "").startsWith("engine_sound_"),
  );
  const GUARD = "query.has_rider";

  it("plays one of eight levels by speed while ridden, over contiguous ranges from rest upward", () => {
    expect(levels).toHaveLength(8);
    let previous = 0;
    levels.forEach((entry, level) => {
      const [name, condition] = Object.entries(entry)[0] ?? ["", ""];
      expect(name).toBe(`engine_sound_${level}`);
      expect(condition.startsWith(GUARD), name).toBe(true);
      const lo = /query\.ground_speed >= ([\d.]+)/.exec(condition)?.[1];
      const hi = /query\.ground_speed < ([\d.]+)/.exec(condition)?.[1];
      expect(lo ? Number(lo) : 0).toBe(previous);
      previous = hi ? Number(hi) : Number.POSITIVE_INFINITY;
      if (level < levels.length - 1)
        expect(previous, name).toBeLessThan(Number.POSITIVE_INFINITY);
    });
    expect(previous).toBe(Number.POSITIVE_INFINITY);
  });

  it("loops each level's own clip for exactly its length, louder as the revs rise", () => {
    let volume = 0;
    levels.forEach((_, level) => {
      const anim = animations[client.animations[`engine_sound_${level}`] ?? ""];
      const [effect] = Object.values<{ effect: string }>(anim.sound_effects);
      expect(effect?.effect).toBe(`engine_${level}`);
      const event = client.sound_effects[`engine_${level}`];
      expect(event).toBe(`yasu_ride.boat_engine_${level}`);
      const [sound] = defs[event].sounds;
      const path = `${RP}/${sound.name}.wav`;
      expect(existsSync(path), path).toBe(true);
      const wav = readFileSync(path);
      // A canonical PCM WAV: byte rate at offset 28, data size at offset 40
      expect(anim.loop).toBe(true);
      expect(anim.animation_length).toBeCloseTo(
        wav.readUInt32LE(40) / wav.readUInt32LE(28),
        3,
      );
      expect(sound.volume).toBeGreaterThan(volume);
      volume = sound.volume;
    });
  });
});
