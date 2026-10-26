import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { assertOneAxis, multipleAxes } from "./oneAxis";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const EXTENSION_CUBES = 3;
const POD_CUBES = 32;
const LEVER_CUBES = 8;
const THROTTLE_CUBES = EXTENSION_CUBES + POD_CUBES + LEVER_CUBES;
const RP = "packs/yasu_ride_rp";
const ENTITY_TEXTURES = `${RP}/textures/entity/yasu_ride`;
const paintAtlas = (paint: string) =>
  paint === "khaki" ? "sportsboat" : `sportsboat_${paint}`;
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
        `textures/entity/yasu_ride/${paintAtlas(paint)}`,
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
    uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
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
    const [rx = 0, ry = 0, rz = 0] = cube.rotation ?? [];
    const pivot = cube.pivot ?? [0, 0, 0];
    const undo = (v: number[]) =>
      rx
        ? turn(v, "x", rx)
        : ry
          ? turn(v, "y", -ry)
          : rz
            ? [
                (v[0] ?? 0) * Math.cos((rz * Math.PI) / 180) -
                  (v[1] ?? 0) * Math.sin((rz * Math.PI) / 180),
                (v[0] ?? 0) * Math.sin((rz * Math.PI) / 180) +
                  (v[1] ?? 0) * Math.cos((rz * Math.PI) / 180),
                v[2] ?? 0,
              ]
            : v;
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
  describe("bimini top panels (ADR 0164, roof series 3/3)", () => {
    const canvas = bone("body").filter(swatch(5));
    const panels = canvas.filter((cube) => cube.size[0] === 32);
    const hatches = bone("body").filter(swatch(6));
    const dome = (z: number) => {
      const t = (z + 10) / 19;
      return 36 - 1.5 * t + 0.6 * (1 - (2 * t - 1) ** 2);
    };
    const expected = [
      [-10, -3, dome(-10), dome(-3)],
      [-3, 6, dome(-3), dome(6)],
      [6, 9, dome(6), dome(9) - 2.4],
    ] as const;
    // Evaluate the top plane, avoiding ray misses at rounded outer-end coordinates.
    const top = (cube: Cube, z: number) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      const angle = ((cube.rotation?.[0] ?? 0) * Math.PI) / 180;
      return (
        pivot[1] +
        (cube.origin[1] + cube.size[1] - pivot[1]) / Math.cos(angle) +
        Math.tan(angle) * (-z - pivot[2])
      );
    };
    // Transform the top edge into the build frame using the same in-game sign as the hull rays.
    const edge = (cube: Cube) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      return [cube.origin[2], cube.origin[2] + cube.size[2]]
        .map((z) => {
          const local = [
            0,
            cube.origin[1] + cube.size[1] - pivot[1],
            z - pivot[2],
          ];
          const turned = turn(local, "x", -(cube.rotation?.[0] ?? 0));
          return -((turned[2] ?? 0) + pivot[2]);
        })
        .sort((a, b) => a - b);
    };

    it("uses three full-width 2 px panels meeting the roof profile with x turns only", () => {
      expect(panels).toHaveLength(3);
      for (const [i, panel] of panels.entries()) {
        const [z0, z1, y0, y1] = expected[i] ?? expected[0];
        expect(panel.origin[0]).toBe(-16);
        expect(panel.size[1]).toBe(2);
        expect(panel.rotation?.slice(1)).toEqual([0, 0]);
        expect(panel.rotation?.[0] ?? 0).toBeCloseTo(
          (-Math.atan2(y1 - y0, z1 - z0) * 180) / Math.PI,
          3,
        );
        expect(panel.pivot).toEqual([0, expect.closeTo(y0, 3), -z0]);
        for (const [z, y] of [
          [z0, y0],
          [z1, y1],
        ]) {
          expect(Math.abs(top(panel, z ?? 0) - (y ?? 0))).toBeLessThan(0.05);
        }
        if (i < 2) {
          const middle = (z0 + z1) / 2;
          expect(Math.abs(top(panel, middle) - dome(middle))).toBeLessThan(0.2);
        }
      }
    });

    it("overlaps joints by their angle allowance with no gap through the thickness", () => {
      for (let i = 0; i < 2; i++) {
        const a = panels[i];
        const b = panels[i + 1];
        if (!a || !b) throw new Error("Missing roof panel");
        const angle = Math.abs((a.rotation?.[0] ?? 0) - (b.rotation?.[0] ?? 0));
        const allowance = Math.max(
          0.25,
          Math.tan((angle * Math.PI) / 180) + 0.05,
        );
        const joint = expected[i]?.[1] ?? 0;
        expect((edge(a)[1] ?? 0) - (edge(b)[0] ?? 0)).toBeGreaterThanOrEqual(
          0.25,
        );
        for (const [panel, end, nominal, sign] of [
          [a, 1, joint, 1],
          [b, 0, joint, -1],
        ] as const) {
          const cosine = Math.cos(((panel.rotation?.[0] ?? 0) * Math.PI) / 180);
          expect(sign * ((edge(panel)[end] ?? 0) - nominal)).toBeCloseTo(
            allowance * cosine,
            3,
          );
        }
        for (const z of [joint - 0.1, joint, joint + 0.1]) {
          const ia = interval(a, [0, 0, -z], [0, 1, 0]);
          const ib = interval(b, [0, 0, -z], [0, 1, 0]);
          expect(ia).toBeDefined();
          expect(ib).toBeDefined();
          if (ia && ib)
            expect(Math.min(ia[1] ?? 0, ib[1] ?? 0)).toBeGreaterThan(
              Math.max(ia[0] ?? 0, ib[0] ?? 0),
            );
        }
      }
      expect(edge(panels[0] as Cube)[0]).toBeCloseTo(-10, 3);
      expect(edge(panels[2] as Cube)[1]).toBeCloseTo(9, 3);
    });

    it("lays one thin darker hatch on the main panel inside its footprint", () => {
      expect(hatches).toHaveLength(1);
      const hatch = hatches[0] as Cube;
      const main = panels[1] as Cube;
      expect(hatch.origin[0]).toBe(-9);
      expect(hatch.size[0]).toBe(18);
      expect(hatch.size[1]).toBe(0.25);
      expect(hatch.rotation).toEqual(main.rotation);
      expect(hatch.pivot).toEqual(main.pivot);
      const footprint = edge(hatch);
      expect(footprint[0]).toBeGreaterThan(-3);
      expect(footprint[1]).toBeLessThan(6);
      for (const z of [-1.9, 0, 4.9]) {
        expect(top(hatch, z) - top(main, z)).toBeCloseTo(
          0.25 / Math.cos(((main.rotation?.[0] ?? 0) * Math.PI) / 180),
          3,
        );
      }
    });

    const allSkirts = canvas.filter((cube) => cube.rotation?.[2]);
    const skirts = allSkirts;
    const bridges = canvas.filter((cube) => cube.size[0] < 0.31);

    it("has no sliced canvas edges or underside ribs", () => {
      expect(canvas).toHaveLength(17);
      for (const cube of canvas) expect(cube.size[2]).not.toBe(2);
      expect(
        bone("body").filter((cube) => swatch(4)(cube) && cube.origin[1] > 33),
      ).toHaveLength(0);
    });

    // The game turns z the other way from the right-handed one (ADR 0058), and the shipped
    // geometry is the build frame turned around, so the written rz is right-handed in the
    // build frame; build x = -x, build z = -z.
    const corners = (cube: Cube) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      const t = (-(cube.rotation?.[2] ?? 0) * Math.PI) / 180;
      return [0, 1].flatMap((i) =>
        [0, 1].map((j) => {
          const x = cube.origin[0] + i * cube.size[0] - pivot[0];
          const y = cube.origin[1] + j * cube.size[1] - pivot[1];
          return [
            -(pivot[0] + x * Math.cos(t) - y * Math.sin(t)),
            pivot[1] + x * Math.sin(t) + y * Math.cos(t),
          ];
        }),
      );
    };
    const endPlates = canvas.filter(
      (cube) => cube.size[2] === 19 && !cube.rotation?.[2],
    );
    const sidePieces = (sign: number) =>
      skirts
        .filter((cube) => Math.sign(cube.pivot?.[0] ?? 0) === sign)
        .sort(
          (a, b) => Math.abs(a.pivot?.[0] ?? 0) - Math.abs(b.pivot?.[0] ?? 0),
        );
    const vertical = (cube: Cube, x: number, z: number) =>
      interval(cube, [-x, 0, -z], [0, 1, 0]);

    describe("continuous rounded side skirts (ADR 0164)", () => {
      it("uses three outward-steepening 0.8 px z-only sheets per side with mirrored signs", () => {
        expect(skirts).toHaveLength(6);
        for (const sign of [-1, 1]) {
          const pieces = sidePieces(sign);
          expect(pieces).toHaveLength(3);
          for (const [i, cube] of pieces.entries()) {
            expect(cube.rotation).toEqual([
              0,
              0,
              expect.closeTo(sign * (15 + i * 15), 3),
            ]);
            expect(cube.size[1]).toBeCloseTo(0.8, 3);
            expect(cube.origin[2]).toBe(-9);
            expect(cube.size[2]).toBe(19);
            const mirror = sidePieces(-sign)[i] as Cube;
            expect(cube.pivot).toEqual([
              expect.closeTo(-(mirror.pivot?.[0] ?? 0), 3),
              mirror.pivot?.[1],
              mirror.pivot?.[2],
            ]);
            expect(cube.size).toEqual(mirror.size);
            for (const [x] of corners(cube))
              expect(Math.abs(x ?? 0)).toBeLessThanOrEqual(19.001);
          }
          const first = pieces[0] as Cube;
          const last = pieces[2] as Cube;
          expect(Math.abs(first.pivot?.[0] ?? 0)).toBe(16);
          const outer = corners(last)
            .filter((_, i) => i % 2 === 1)
            .sort((a, b) => Math.abs(b[0] ?? 0) - Math.abs(a[0] ?? 0))[0];
          expect(Math.abs(outer?.[0] ?? 0)).toBeCloseTo(19, 3);
          expect((first.pivot?.[1] ?? 0) - (outer?.[1] ?? 0)).toBeCloseTo(
            2.6,
            3,
          );
          expect(first.pivot?.[1]).toBeCloseTo(dome(9) - 2.4, 3);
        }
      });

      it("overlaps adjacent sheets through their shared edges along the full rear-to-front span", () => {
        for (const sign of [-1, 1]) {
          const pieces = sidePieces(sign);
          for (let i = 0; i < 2; i++) {
            const a = pieces[i] as Cube;
            const b = pieces[i + 1] as Cube;
            const joint = Math.abs(b.pivot?.[0] ?? 0);
            const allowance = Math.max(
              0.25,
              (0.8 * Math.tan(Math.PI / 12)) / 2 + 0.05,
            );
            const end = Math.max(
              ...corners(a)
                .filter((_, i) => i % 2 === 1)
                .map(([x]) => Math.abs(x ?? 0)),
            );
            expect(end - joint).toBeCloseTo(
              allowance * Math.cos(((15 + i * 15) * Math.PI) / 180),
              3,
            );
            for (const z of [-10, -3, 0, 6, 9])
              for (const offset of [-0.1, 0, 0.1]) {
                const ia = vertical(a, -sign * (joint + offset), z);
                const ib = vertical(b, -sign * (joint + offset), z);
                expect(ia).toBeDefined();
                expect(ib).toBeDefined();
                if (ia && ib)
                  expect(Math.min(ia[1] ?? 0, ib[1] ?? 0)).toBeGreaterThan(
                    Math.max(ia[0] ?? 0, ib[0] ?? 0),
                  );
              }
          }
        }
      });
    });

    it("bridges the sloping top to the level roll without a side opening at any z", () => {
      expect(bridges).toHaveLength(4);
      const shoulder = dome(9) - 2.4;
      for (let z = -9.99; z < 9; z += 0.1) {
        const panel = panels[z < -3 ? 0 : z < 6 ? 1 : 2] as Cube;
        for (let y = shoulder - 0.3; y < top(panel, z) - 0.01; y += 0.1) {
          for (const sign of [-1, 1]) {
            const hits = canvas.flatMap((cube) => {
              const hit = interval(cube, [0, y, -z], [sign, 0, 0]);
              return hit ? [hit] : [];
            });
            expect(
              hits.some(([lo, hi]) => (lo ?? 20) <= 19 && (hi ?? 0) >= 15.9),
              `Side opening at ${sign}, ${y}, ${z}`,
            ).toBe(true);
          }
        }
      }
      const lipBridges = bridges.filter((cube) => cube.rotation?.[0]);
      expect(lipBridges).toHaveLength(2);
      for (const bridge of lipBridges) {
        expect(bridge.rotation).toEqual(panels[2]?.rotation);
      }
    });

    it("closes the end triangles with continuous backing plates inside the hems", () => {
      expect(endPlates).toHaveLength(4);
      for (const plate of endPlates) {
        expect(plate.rotation ?? [0, 0, 0]).toEqual([0, 0, 0]);
        const mirror = endPlates.find(
          (other) =>
            other !== plate &&
            other.origin[2] === plate.origin[2] &&
            other.origin[1] === plate.origin[1] &&
            Math.abs(other.origin[0] + other.size[0] + plate.origin[0]) <
              0.001 &&
            other.size[1] === plate.size[1],
        );
        expect(mirror?.size).toEqual(plate.size);
        expect(plate.origin[1]).toBeGreaterThan(28.63);
        expect(
          Math.max(
            Math.abs(plate.origin[0]),
            Math.abs(plate.origin[0] + plate.size[0]),
          ),
        ).toBeLessThan(19);
      }
    });

    it("blocks sight lines through both sides of every exposed triangular end cross-section", () => {
      for (const [z, reach, outerY, innerY] of [
        [-10, 19, 29.5, 32.1],
        [9, 19, 29.5, 32.1],
      ] as const) {
        for (const sign of [-1, 1]) {
          // Cast through the triangular interior, rather than merely checking that panels exist.
          for (let x = 16.01; x < reach; x += 0.025) {
            const ceiling =
              innerY + ((outerY - innerY) * (x - 16)) / (reach - 16);
            for (let y = outerY + 0.01; y < ceiling; y += 0.025) {
              const hits = canvas.flatMap((cube) => {
                const hit = interval(cube, [-sign * x, y, -z], [0, 0, 1]);
                return hit ? [hit] : [];
              });
              expect(
                hits.some(
                  ([lo, hi]) => (lo ?? 1) <= 0.001 && (hi ?? -1) >= -0.001,
                ),
                `Open end at ${sign * x}, ${y}, ${z}`,
              ).toBe(true);
            }
          }
          const plates = endPlates.filter(
            (plate) =>
              Math.sign(plate.origin[0]) === -sign &&
              -z >= plate.origin[2] &&
              -z <= plate.origin[2] + plate.size[2],
          );
          expect(plates).toHaveLength(2);
          // Both backing plates overlap in area and bury their outer top corners in the skirt sheets.
          const [a, b] = plates as [Cube, Cube];
          expect(
            Math.min(a.origin[0] + a.size[0], b.origin[0] + b.size[0]),
          ).toBeGreaterThan(Math.max(a.origin[0], b.origin[0]));
          for (const plate of plates) {
            const x = Math.max(
              Math.abs(plate.origin[0]),
              Math.abs(plate.origin[0] + plate.size[0]),
            );
            const y = plate.origin[1] + plate.size[1];
            const sheets = skirts;
            const spans = sheets.flatMap((cube) => {
              const hit = vertical(cube, sign * x, z);
              return hit ? [hit] : [];
            });
            expect(
              spans.some(
                ([lo, hi]) => (lo ?? Infinity) < y && (hi ?? -Infinity) > y,
              ),
            ).toBe(true);
          }
        }
      }
    });

    it("keeps every backing and bridge corner inside x 19 and above the physical outer hem", () => {
      const hem = 29.5 - 0.8 * Math.cos(Math.PI / 4);
      for (const cube of [...bridges, ...endPlates]) {
        const pivot = cube.pivot ?? [0, 0, 0];
        for (const i of [0, 1])
          for (const j of [0, 1])
            for (const k of [0, 1]) {
              const local = [i, j, k].map(
                (v, axis) =>
                  (cube.origin[axis] ?? 0) +
                  v * (cube.size[axis] ?? 0) -
                  (pivot[axis] ?? 0),
              );
              const point = turn(local, "x", -(cube.rotation?.[0] ?? 0));
              expect(Math.abs((point[0] ?? 0) + pivot[0])).toBeLessThanOrEqual(
                19,
              );
              expect((point[1] ?? 0) + pivot[1]).toBeGreaterThanOrEqual(hem);
            }
      }
    });

    it("builds the entire Bimini within eighteen cubes with at most one rotation axis each", () => {
      const bimini = [
        ...canvas,
        ...hatches,
        ...bone("body").filter(
          (cube) => swatch(4)(cube) && cube.origin[1] > 33,
        ),
      ];
      expect(bimini).toHaveLength(18);
      expect(bimini.length).toBeLessThanOrEqual(18);
      for (const cube of bimini) {
        expect(
          (cube.rotation ?? []).filter((angle) => angle !== 0).length,
        ).toBeLessThanOrEqual(1);
      }
      expect(cubes).toHaveLength(1334 + THROTTLE_CUBES);
    });
  });

  describe("tower speakers (ADR 0165)", () => {
    // Shipped frame: the build frame is turned around, so the speakers sit at z 3.5..8.9
    // (build z G - 0.3 .. G + 5.1 with G = -8.6) and |x| = 9.5.
    const speakers = bone("body").filter(
      (cube) =>
        Math.abs(cube.origin[0] + cube.size[0] / 2) >= 8 &&
        Math.abs(cube.origin[0] + cube.size[0] / 2) <= 11 &&
        cube.origin[2] >= 3.5 &&
        cube.origin[2] + cube.size[2] <= 8.9,
    );
    const isSpoke = (cube: Cube) => swatch(17)(cube) && cube.size[2] < 0.2;
    const isMount = (cube: Cube) => swatch(3)(cube) && cube.size[0] === 1;

    it("builds each speaker from 74 panels, 12 spokes and a mount", () => {
      const spokes = speakers.filter(isSpoke);
      const mounts = speakers.filter(isMount);
      expect(spokes).toHaveLength(24);
      expect(mounts).toHaveLength(2);
      expect(speakers.length - spokes.length - mounts.length).toBe(148);
      expect(speakers).toHaveLength(174);
      expect(speakers.length).toBeLessThanOrEqual(186);
    });

    const sections = [
      { name: "back", r: 1.6, z0: -0.05, z1: 0, swatch: 3 },
      { name: "hub", r: 0.45, z0: -0.25, z1: -0.05, swatch: 17 },
      { name: "bezel", r: 1.9, z0: 0, z1: 0.5, swatch: 20 },
      { name: "ring", r: 1.95, z0: 0.5, z1: 0.7, swatch: 18 },
      { name: "pod_0", r: 1.9, z0: 0.7, z1: 2.4, swatch: 20 },
      { name: "pod_1", r: 1.6, z0: 2.4, z1: 3.6, swatch: 20 },
      { name: "pod_2", r: 1.15, z0: 3.6, z1: 4.5, swatch: 20 },
      { name: "pod_3", r: 0.6, z0: 4.5, z1: 5, swatch: 20 },
    ];
    const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const atSpeaker = (cube: Cube, sx: number) =>
      close(cube.pivot?.[0] ?? 0, sx);
    // Bedrock turns z clockwise in the shipped frame (ADR 0058).
    const corner = (cube: Cube, x: number, y: number) => {
      const [px = 0, py = 0] = cube.pivot ?? [];
      const angle = -((cube.rotation?.[2] ?? 0) * Math.PI) / 180;
      const dx = x - px;
      const dy = y - py;
      return [
        dx * Math.cos(angle) - dy * Math.sin(angle),
        dx * Math.sin(angle) + dy * Math.cos(angle),
      ] as const;
    };
    const distance = (a: readonly number[], b: readonly number[]) =>
      Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0));

    for (const sx of [-9.5, 9.5]) {
      for (const section of sections) {
        const solid = ["back", "hub", "pod_3"].includes(section.name);
        const sides = solid && section.r < 1 ? 8 : 12;
        const panelCount = solid ? sides / 2 : sides;
        it(`makes ${section.name} at x ${sx} from tangent panels meeting at shared vertices`, () => {
          const panels = speakers
            .filter(
              (cube) =>
                swatch(section.swatch)(cube) &&
                atSpeaker(cube, sx) &&
                close(cube.origin[2], 8.6 - section.z1) &&
                close(cube.size[2], section.z1 - section.z0) &&
                close(
                  cube.origin[1] + cube.size[1] - (cube.pivot?.[1] ?? 0),
                  section.r,
                ),
            )
            .sort((a, b) => (a.rotation?.[2] ?? 0) - (b.rotation?.[2] ?? 0));
          expect(panels).toHaveLength(panelCount);
          for (const [k, panel] of panels.entries()) {
            expect(panel.rotation?.slice(0, 2)).toEqual([0, 0]);
            expect(panel.rotation?.[2]).toBeCloseTo((360 * k) / sides, 4);
            expect(panel.size[1]).toBeCloseTo(solid ? 2 * section.r : 0.5, 4);
            expect(panel.size[0]).toBeCloseTo(
              2 * section.r * Math.tan(Math.PI / sides),
              4,
            );
            expect(panel.pivot?.[2]).toBeCloseTo(8.6 - section.z0, 4);
            const [x, y] = panel.origin;
            const w = panel.size[0];
            const top = y + panel.size[1];
            const left = corner(panel, x, top);
            const right = corner(panel, x + w, top);
            const faceDistance =
              Math.abs(left[0] * right[1] - left[1] * right[0]) /
              distance(left, right);
            expect(Math.abs(faceDistance - section.r)).toBeLessThan(0.01);
            const next = panels[(k + 1) % panelCount];
            expect(next).toBeDefined();
            if (next) {
              const nextLeft = corner(
                next,
                next.origin[0] +
                  (solid && k === panelCount - 1 ? next.size[0] : 0),
                next.origin[1] +
                  (solid && k === panelCount - 1 ? 0 : next.size[1]),
              );
              expect(distance(right, nextLeft)).toBeLessThan(0.01);
            }
            for (const cx of [x, x + w]) {
              for (const cy of [y, top]) {
                expect(
                  Math.hypot(...corner(panel, cx, cy)),
                ).toBeLessThanOrEqual(
                  section.r / Math.cos(Math.PI / sides) + 0.01,
                );
              }
            }
          }
        });
      }
    }

    it("contains only section panels, spokes and mounts within the existing bounds", () => {
      for (const cube of speakers) {
        const sx = Math.sign(cube.origin[0] + cube.size[0] / 2) * 9.5;
        const axis = speakers.find((panel) => atSpeaker(panel, sx))?.pivot;
        expect(axis).toBeDefined();
        const section = sections.find(
          (section) =>
            atSpeaker(cube, sx) &&
            swatch(section.swatch)(cube) &&
            close(cube.origin[2], 8.6 - section.z1) &&
            close(cube.size[2], section.z1 - section.z0),
        );
        expect(Boolean(section) || isSpoke(cube) || isMount(cube)).toBe(true);
        expect((cube.rotation ?? [0, 0, 0]).slice(0, 2)).toEqual([0, 0]);
        for (const x of [cube.origin[0], cube.origin[0] + cube.size[0]]) {
          for (const y of [cube.origin[1], cube.origin[1] + cube.size[1]]) {
            const [dx, dy] = corner(cube, x, y);
            const worldX = dx + (cube.pivot?.[0] ?? 0);
            const worldY = dy + (cube.pivot?.[1] ?? 0);
            expect(Math.abs(worldX - sx)).toBeLessThanOrEqual(
              1.85 * Math.SQRT2 + 0.01,
            );
            expect(Math.abs(worldY - (axis?.[1] ?? 0))).toBeLessThanOrEqual(
              1.85 * Math.SQRT2 + 0.01,
            );
            if (isSpoke(cube) || isMount(cube)) {
              expect(
                Math.hypot(worldX - sx, worldY - (axis?.[1] ?? 0)),
              ).toBeLessThan(1.9 * Math.cos(Math.PI / 12));
            }
          }
        }
        expect(cube.origin[2]).toBeGreaterThanOrEqual(3.5);
        expect(cube.origin[2] + cube.size[2]).toBeLessThanOrEqual(8.9);
      }
      expect(1.05 + 0.55).toBeLessThan(1.9 * Math.cos(Math.PI / 12));
    });

    it("splits the round sections by swatch", () => {
      const count = (index: number) => speakers.filter(swatch(index)).length;
      expect(count(3)).toBe(14);
      expect(count(17)).toBe(32);
      expect(count(18)).toBe(24);
      expect(count(20)).toBe(104);
    });
  });

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

  describe("steering wheel tilt (ADR 0166, #668)", () => {
    const F = 9.3;
    const pivot = [-7.6, F + 7.5, -7.4];
    const body = bone("body");
    // The console anchors the 273-cube helm block, independent of hull cube counts.
    const start = body.findIndex(
      (cube) =>
        cube.origin[0] === -15.4 &&
        cube.origin[1] === F &&
        cube.origin[2] === -16 &&
        cube.size[1] === 7,
    );
    const helm = body.slice(start, start + 273);
    const wheel = helm.slice(13, 159);
    const supports = helm.slice(159, 162);
    const angles = [
      ...Array.from({ length: 120 }, (_, i) => (i % 40) * 9 + 90),
      20,
      20,
      20,
      20,
      160,
      160,
      160,
      160,
      270,
      // Pad and cap: eight diametral panels each, then the LED
      ...Array.from({ length: 8 }, (_, k) => k * 22.5),
      ...Array.from({ length: 8 }, (_, k) => k * 22.5),
      0,
    ];
    const rotate = (v: number[], rotation: number[], inverse = false) => {
      let [x = 0, y = 0, z = 0] = v;
      const axes = inverse ? [2, 1, 0] : [0, 1, 2];
      for (const axis of axes) {
        const degrees =
          (rotation[axis] ?? 0) * (axis === 1 ? 1 : -1) * (inverse ? -1 : 1);
        const sin = Math.sin((degrees * Math.PI) / 180);
        const cos = Math.cos((degrees * Math.PI) / 180);
        if (axis === 0) [y, z] = [y * cos - z * sin, y * sin + z * cos];
        else if (axis === 1) [x, z] = [x * cos + z * sin, -x * sin + z * cos];
        else [x, y] = [x * cos - y * sin, x * sin + y * cos];
      }
      return [x, y, z];
    };
    const corners = (cube: Cube) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      return Array.from({ length: 8 }, (_, bits) => {
        const offset = cube.origin.map(
          (v, i) =>
            v + ((bits >> i) & 1) * (cube.size[i] ?? 0) - (pivot[i] ?? 0),
        );
        return rotate(offset, cube.rotation ?? []).map(
          (v, i) => v + (pivot[i] ?? 0),
        );
      });
    };
    const near = (actual: number[], expected: number[], tolerance = 0.0002) => {
      actual.forEach((v, i) => {
        expect(Math.abs(v - (expected[i] ?? 0))).toBeLessThan(tolerance);
      });
    };
    const unTilt = (point: number[]) =>
      rotate(
        point.map((v, i) => v - (pivot[i] ?? 0)),
        [30, 0, 0],
        true,
      );

    it("composes every wheel cube rigidly and limits the rotation exception to exactly those cubes", () => {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(wheel).toHaveLength(146);
      expect(supports).toHaveLength(3);
      wheel.forEach((cube, i) => {
        for (const basis of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]) {
          // turn_around flips x and z; the shipped assembly tilts by +30 in game angles.
          const expected = rotate(
            rotate(basis, [0, 0, angles[i] ?? 0]),
            [30, 0, 0],
          );
          near(rotate(basis, cube.rotation ?? []), expected, 0.00001);
        }
      });
      const assemblies = {
        wheel,
        throttle_lever: body.slice(
          start + 273 + EXTENSION_CUBES + POD_CUBES,
          start + 273 + THROTTLE_CUBES,
        ),
      };
      expect(() => assertOneAxis(cubes, assemblies)).not.toThrow();
      expect(wheel.filter(multipleAxes)).toHaveLength(140);
      const centroid = (points: number[][]) =>
        [0, 1, 2].map(
          (i) =>
            points.reduce((sum, p) => sum + (p[i] ?? 0), 0) / points.length,
        );
      near(centroid(wheel.slice(0, 120).flatMap(corners)), pivot, 0.01);
      // The LED and spoke details make the complete assembly slightly asymmetric before tilt.
      const before = [
        -7.603081849315078, 16.796825535754635, -7.364555862421794,
      ];
      const expected = rotate(
        before.map((v, i) => v - (pivot[i] ?? 0)),
        [30, 0, 0],
      ).map((v, i) => v + (pivot[i] ?? 0));
      near(centroid(wheel.flatMap(corners)), expected, 0.01);
    });

    it("keeps every rim segment in a plane tilted 30 degrees away from the driver", () => {
      for (const cube of wheel.slice(0, 120)) {
        const normal = rotate([0, 0, -1], cube.rotation ?? []);
        const angle = (Math.acos(-(normal[2] ?? 0)) * 180) / Math.PI;
        expect(Math.abs(angle - 30)).toBeLessThanOrEqual(0.1);
        near(normal, [0, -0.5, -Math.sqrt(3) / 2]);
      }
    });

    it("clears the cockpit floor, consoles and 45-degree display without moving WZ", () => {
      const obstacles = [...helm.slice(0, 4), ...helm.slice(8, 10)];
      expect(obstacles.slice(4).map((cube) => cube.rotation)).toEqual([
        [45, 0, 0],
        [45, 0, 0],
      ]);
      for (const point of wheel.flatMap(corners)) {
        expect(point[1]).toBeGreaterThanOrEqual(F + 4.5);
        for (const cube of obstacles) {
          const p = cube.pivot ?? [0, 0, 0];
          const local = rotate(
            point.map((v, i) => v - (p[i] ?? 0)),
            cube.rotation ?? [],
            true,
          ).map((v, i) => v + (p[i] ?? 0));
          expect(
            local.every(
              (v, i) =>
                v > (cube.origin[i] ?? 0) &&
                v < (cube.origin[i] ?? 0) + (cube.size[i] ?? 0),
            ),
          ).toBe(false);
        }
      }
      const rimPivots = wheel.slice(0, 40).map((cube) => cube.pivot ?? []);
      near(
        [0, 1, 2].map(
          (i) => rimPivots.reduce((sum, p) => sum + (p[i] ?? 0), 0) / 40,
        ),
        pivot,
        0.0001,
      );
    });

    it("keeps the two display plates at 45 degrees with a flush driver-side face", () => {
      const display = helm.slice(8, 10);
      expect(display).toHaveLength(2);
      const [frame, face] = display as [Cube, Cube];
      for (const cube of display) {
        expect(cube.rotation).toEqual([45, 0, 0]);
        expect(cube.pivot).toEqual([-9.2, F + 8, -13.5]);
      }
      near(frame.size, [7, 4.2, 0.6]);
      // Moved 3.7 px toward the switch plate (turned frame: -x), so the centre sits at 9.2 (was 5.5).
      expect(frame.origin[0] + frame.size[0] / 2).toBeCloseTo(-9.2);
      expect(face.origin[0] + face.size[0] / 2).toBeCloseTo(-9.2);
      near(face.size, [6.4, 3.6, 0.1]);
      expect(Math.abs(face.size[0] / face.size[1] - 16 / 9)).toBeLessThan(0.01);
      expect(frame.origin[1]).toBeCloseTo(F + 8.15);
      // In the turned frame the driver is at +z; both plates share the same transform.
      const surface = frame.origin[2] + frame.size[2];
      expect(face.origin[2]).toBeCloseTo(surface);
      expect(face.origin[2] + face.size[2] - surface).toBeCloseTo(0.1);
      for (const axis of [0, 1]) {
        expect(
          (face.origin[axis] ?? 0) - (frame.origin[axis] ?? 0),
        ).toBeCloseTo(0.3);
        expect(
          (frame.origin[axis] ?? 0) +
            (frame.size[axis] ?? 0) -
            ((face.origin[axis] ?? 0) + (face.size[axis] ?? 0)),
        ).toBeCloseTo(0.3);
      }
    });

    it("keeps every display corner above the dash, below the rail and behind the front glass", () => {
      const railY = 17.6 + 4.5;
      const rake = (22 - 15.5) / 4.5;
      for (const cube of helm.slice(8, 10)) {
        for (const [, y = 0, z = 0] of corners(cube)) {
          expect(y).toBeGreaterThanOrEqual(F + 8 - 1e-6);
          expect(y).toBeLessThan(railY);
          const glassZ = 22 - (y - 17.6) * rake;
          // Signed perpendicular distance to the front glass plane in the build frame.
          expect((glassZ + z) / Math.hypot(1, rake)).toBeGreaterThan(0.5);
        }
      }
    });

    it("separates the display from every wheel, support, switch, cupholder and dial cube", () => {
      const bounds = (cube: Cube) => {
        const points = corners(cube);
        return [0, 1, 2].map((axis) => [
          Math.min(...points.map((point) => point[axis] ?? 0)),
          Math.max(...points.map((point) => point[axis] ?? 0)),
        ]);
      };
      expect(wheel).toHaveLength(146);
      const obstacles = helm.slice(10);
      expect(obstacles).toHaveLength(263);
      for (const display of helm.slice(8, 10)) {
        const screen = bounds(display);
        for (const cube of obstacles) {
          const other = bounds(cube);
          expect(
            screen.some(
              (range, axis) =>
                (range[1] ?? 0) <= (other[axis]?.[0] ?? 0) ||
                (other[axis]?.[1] ?? 0) <= (range[0] ?? 0),
            ),
            JSON.stringify(cube.origin),
          ).toBe(true);
        }
      }
    });

    it("builds the hub pad and cap from solid diametral panels that stay round", () => {
      const panels = wheel.slice(129, 145);
      expect(panels).toHaveLength(16);
      for (const [cubes, radius] of [
        [panels.slice(0, 8), 1.3],
        [panels.slice(8), 0.6],
      ] as const) {
        // A panel is a diametral box: a full diameter long, so no disc() square pair remains.
        for (const cube of cubes) {
          expect(Math.abs(cube.size[1] - 2 * radius)).toBeLessThan(0.0001);
          expect(cube.size[0]).toBeLessThan(cube.size[1]);
        }
        const reach = cubes.flatMap((cube) =>
          corners(cube).map((p) => {
            const q = unTilt(p);
            return Math.hypot(q[0] ?? 0, q[1] ?? 0);
          }),
        );
        expect(Math.max(...reach)).toBeGreaterThan(radius - 0.05);
        expect(Math.max(...reach)).toBeLessThan(radius + 0.05);
      }
    });

    it("joins the column top to the pad rear face without protruding through it", () => {
      const pad = wheel[129];
      const column = supports[2];
      expect(pad).toBeDefined();
      expect(column).toBeDefined();
      if (!pad || !column) return;
      const padRear = Math.min(...corners(pad).map((p) => unTilt(p)[2] ?? 0));
      const top = corners(column)
        .map(unTilt)
        .filter((p) => Math.abs((p[1] ?? 0) + 0.9) < 0.001);
      expect(top).toHaveLength(4);
      const contact = top.filter((p) => Math.abs((p[2] ?? 0) - padRear) <= 0.1);
      expect(contact).toHaveLength(2);
      for (const p of contact) expect(Math.abs(p[0] ?? 0)).toBeLessThan(1.3);
      for (const cube of supports) {
        expect((cube.rotation ?? []).filter((v) => v !== 0)).toHaveLength(1);
        for (const point of corners(cube))
          expect(unTilt(point)[2]).toBeLessThanOrEqual(padRear + 0.0002);
      }
    });
  });

  describe("switch plate (ADR 0166, #669)", () => {
    const F = 9.3;
    const body = bone("body");
    const tile: { uv: [number, number]; size: [number, number] } = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `
import json, sys
sys.path.insert(0, "tools")
import tile_layout
uv, size = tile_layout.TILE_RECTS["switch_plate"]
print(json.dumps({"uv": list(uv), "size": list(size)}))
`,
        ],
        { encoding: "utf8" },
      ),
    );
    const plates = body.filter(
      (cube) =>
        cube.uv.up?.uv[0] === tile.uv[0] && cube.uv.up?.uv[1] === tile.uv[1],
    );
    const plate = plates[0] as Cube;
    // The game frame is turned around, so x and z are negated and the tilt reads +20.
    const corners = (cube: Cube) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      const radians = (-(cube.rotation?.[0] ?? 0) * Math.PI) / 180;
      return Array.from({ length: 8 }, (_, bits) => {
        const [x = 0, y = 0, z = 0] = cube.origin.map(
          (v, i) =>
            v + ((bits >> i) & 1) * (cube.size[i] ?? 0) - (pivot[i] ?? 0),
        );
        return [
          x + (pivot[0] ?? 0),
          y * Math.cos(radians) - z * Math.sin(radians) + (pivot[1] ?? 0),
          y * Math.sin(radians) + z * Math.cos(radians) + (pivot[2] ?? 0),
        ];
      });
    };
    const bounds = (cube: Cube) => {
      const points = corners(cube);
      return [0, 1, 2].map((i) => [
        Math.min(...points.map((p) => p[i] ?? 0)),
        Math.max(...points.map((p) => p[i] ?? 0)),
      ]);
    };

    it("is one gloss plate turned about x only by the switch tilt, with the face tile on top", () => {
      expect(plates).toHaveLength(1);
      expect(plate.rotation).toEqual([20, 0, 0]);
      expect(plate.origin).toEqual([-15, F + 8, -14.6]);
      expect(plate.pivot).toEqual([-13.9, F + 8, -14.6]);
      expect(plate.size[0]).toBeCloseTo(2.2);
      expect(plate.size[1]).toBeCloseTo(0.4);
      expect(plate.size[2]).toBeCloseTo(2.8);
      expect(plate.uv.up).toEqual({ uv: tile.uv, uv_size: tile.size });
      expect(tile.size[0]).toBeLessThanOrEqual(20);
      expect(tile.size[1]).toBeLessThanOrEqual(24);
      for (const face of ["down", "north", "south", "east", "west"])
        expect(plate.uv[face]?.uv[0], face).toBe(3 * 4 + 1);
    });

    it("keeps its low edge on the dash and clears the display and dial after tilting", () => {
      expect(Math.min(...corners(plate).map((p) => p[1] ?? 0))).toBeCloseTo(
        F + 8,
      );
      const [px, py, pz] = bounds(plate) as [number[], number[], number[]];
      expect(pz[0]).toBeGreaterThanOrEqual(-15.5);
      expect(pz[1]).toBeLessThanOrEqual(-10);
      const obstacles = body.filter(
        (cube) =>
          (cube.origin[0] === -12.7 && cube.origin[2] === -13.65) ||
          (cube.origin[0] === -12.4 && cube.origin[2] === -13.05) ||
          (cube.origin[0] >= -15.7 &&
            cube.origin[0] <= -13.1 &&
            cube.origin[1] >= F + 6.5 &&
            cube.origin[1] <= F + 7.44 &&
            cube.origin[2] >= -9 &&
            cube.origin[2] <= -5),
      );
      expect(obstacles).toHaveLength(111);
      for (const cube of obstacles) {
        const other = bounds(cube);
        const apart = [px, py, pz].some(
          (range, i) =>
            (range?.[1] ?? 0) <= (other[i]?.[0] ?? 0) ||
            (other[i]?.[1] ?? 0) <= (range?.[0] ?? 0),
        );
        expect(apart, JSON.stringify(cube.origin)).toBe(true);
      }
    });

    it("leaves no raised metal button cube on the plate", () => {
      const metal = body.filter(
        (cube) =>
          swatch(13)(cube) &&
          cube.origin[0] >= -15 &&
          cube.origin[0] <= -12.8 &&
          cube.origin[1] >= F + 8 &&
          cube.origin[1] <= F + 9,
      );
      expect(metal).toEqual([]);
    });
  });

  describe("panel-built helm dial (ADR 0166)", () => {
    const F = 9.3;
    const body = bone("body");
    const tiles: Record<
      string,
      { uv: [number, number]; size: [number, number] }
    > = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `
import json, sys
sys.path.insert(0, "tools")
import tile_layout
tile_layout.assert_tile_allocations(tile_layout.TILE_RECTS, 128, 32)
print(json.dumps({name: {"uv": uv, "size": size}
                  for name, (uv, size) in tile_layout.TILE_RECTS.items()}))
`,
        ],
        { encoding: "utf8" },
      ),
    );
    const tile = tiles.dial_pad as {
      uv: [number, number];
      size: [number, number];
    };
    const start = body.findIndex(
      (cube) =>
        cube.origin[0] === -15.4 &&
        cube.origin[1] === F &&
        cube.origin[2] === -16 &&
        cube.size[1] === 7,
    );
    const helm = body.slice(start, start + 273);
    const controller = helm.slice(162);
    const plates = controller.filter(
      (cube) =>
        (cube.uv.up?.uv[0] ?? 0) >= tile.uv[0] &&
        (cube.uv.up?.uv[0] ?? 0) < tile.uv[0] + tile.size[0] &&
        (cube.uv.up?.uv[1] ?? 0) >= tile.uv[1],
    );
    const rotate = (v: number[], rotation: number[], inverse = false) => {
      let [x = 0, y = 0, z = 0] = v;
      const axes = inverse ? [2, 1, 0] : [0, 1, 2];
      for (const axis of axes) {
        const degrees =
          (rotation[axis] ?? 0) * (axis === 1 ? 1 : -1) * (inverse ? -1 : 1);
        const sin = Math.sin((degrees * Math.PI) / 180);
        const cos = Math.cos((degrees * Math.PI) / 180);
        if (axis === 0) [y, z] = [y * cos - z * sin, y * sin + z * cos];
        else if (axis === 1) [x, z] = [x * cos + z * sin, -x * sin + z * cos];
        else [x, y] = [x * cos - y * sin, x * sin + y * cos];
      }
      return [x, y, z];
    };
    const corners = (cube: Cube) => {
      const pivot = cube.pivot ?? [0, 0, 0];
      return Array.from({ length: 8 }, (_, bits) => {
        const offset = cube.origin.map(
          (v, i) =>
            v + ((bits >> i) & 1) * (cube.size[i] ?? 0) - (pivot[i] ?? 0),
        );
        return rotate(offset, cube.rotation ?? []).map(
          (v, i) => v + (pivot[i] ?? 0),
        );
      });
    };

    const bounds = (parts: Cube[]) => {
      const points = parts.flatMap(corners);
      return [0, 1, 2].map((i) => [
        Math.min(...points.map((p) => p[i] ?? 0)),
        Math.max(...points.map((p) => p[i] ?? 0)),
      ]);
    };

    describe("sports boat throttle (ADR 0166, #684)", () => {
      const throttle = body.slice(start + 273, start + 273 + THROTTLE_CUBES);
      const extension = throttle.slice(0, EXTENSION_CUBES);
      const pod = throttle.slice(EXTENSION_CUBES, EXTENSION_CUBES + POD_CUBES);
      const lever = throttle.slice(EXTENSION_CUBES + POD_CUBES);
      const gap = (a: Cube, b: Cube) => {
        const other = bounds([b]);
        return bounds([a]).map((range, axis) =>
          Math.max(
            0,
            (range[0] ?? 0) - (other[axis]?.[1] ?? 0),
            (other[axis]?.[0] ?? 0) - (range[1] ?? 0),
          ),
        );
      };
      const separated = (a: Cube, b: Cube) => {
        const other = bounds([b]);
        return bounds([a]).some(
          (range, axis) =>
            (range[1] ?? 0) <= (other[axis]?.[0] ?? 0) + 0.001 ||
            (other[axis]?.[1] ?? 0) <= (range[0] ?? 0) + 0.001,
        );
      };

      it("supports the old footprint under the dial and reaches 4.2 px toward the driver with a chamfer", () => {
        expect(extension).toHaveLength(EXTENSION_CUBES);
        const b = bounds(extension);
        expect(b[0]?.[0]).toBeCloseTo(-15.4);
        expect(b[0]?.[1]).toBeCloseTo(-11.4);
        expect(b[2]?.[0]).toBeCloseTo(-9);
        expect(b[2]?.[1]).toBeCloseTo(-4.8);
        expect((b[2]?.[1] ?? 0) + 9).toBeCloseTo(4.2);
        expect(b[1]?.[0]).toBeCloseTo(F);
        expect(b[1]?.[1]).toBeCloseTo(bounds(controller)[1]?.[0] ?? 0);
        for (const z of [-5, -7, -9]) {
          expect(
            extension.some((cube) => {
              const box = bounds([cube]);
              return (
                (box[2]?.[0] ?? 0) <= z &&
                (box[2]?.[1] ?? 0) >= z &&
                Math.abs((box[1]?.[1] ?? 0) - F - 6.5) < 0.001
              );
            }),
          ).toBe(true);
        }
        expect(extension[2]?.rotation).toEqual([-45, 0, 0]);
        const diagonal = corners(extension[2] as Cube);
        for (const [y, z] of [
          [F, -5.8],
          [F + 1, -4.8],
        ]) {
          expect(
            diagonal.some(
              (p) =>
                Math.abs((p[1] ?? 0) - (y ?? 0)) < 0.001 &&
                Math.abs((p[2] ?? 0) - (z ?? 0)) < 0.001,
            ),
          ).toBe(true);
        }
      });

      it("builds the dome from four solid 16-sided rings", () => {
        expect(pod).toHaveLength(POD_CUBES);
        for (const [i, radius, bottom, top, slot] of [
          [0, 1.3, 3.4, 3.7, 22],
          [1, 1.3, 3.7, 4.5, 3],
          [2, 1.15, 4.5, 5, 3],
          [3, 1, 5, 5.3, 3],
        ]) {
          const ring = pod.slice((i ?? 0) * 8, (i ?? 0) * 8 + 8);
          expect(ring).toHaveLength(8);
          const b = bounds(ring);
          expect(b[1]?.[0]).toBeCloseTo(F + (bottom ?? 0));
          expect(b[1]?.[1]).toBeCloseTo(F + (top ?? 0));
          ring.forEach((cube, k) => {
            expect(swatch(slot ?? 0)(cube)).toBe(true);
            expect(cube.rotation).toEqual([0, k * 22.5, 0]);
            expect(cube.size[2]).toBeCloseTo(2 * (radius ?? 0));
            expect(cube.pivot?.[0]).toBeCloseTo(-12.7);
            expect(cube.pivot?.[1]).toBeCloseTo(F + (bottom ?? 0));
            expect(cube.pivot?.[2]).toBeCloseTo(-3.6);
          });
        }
      });

      it("clears the wheel, dial, switch, display, seats and walk-through", () => {
        const seats = body
          .slice(0, start)
          .filter((cube) => swatch(7)(cube) || swatch(8)(cube));
        expect(seats.length).toBeGreaterThan(0);
        const obstacles = [...helm.slice(8, 11), ...helm.slice(13), ...seats];
        for (const part of throttle) {
          expect(bounds([part])[0]?.[1]).toBeLessThanOrEqual(-3.5);
          for (const obstacle of obstacles) {
            expect(
              separated(part, obstacle),
              JSON.stringify({ part, obstacle }),
            ).toBe(true);
          }
        }
      });

      it("connects every part to the console through contacts within 0.1 px", () => {
        const connected = [helm[0] as Cube];
        const remaining = new Set(throttle);
        let changed = true;
        while (changed) {
          changed = false;
          for (const part of remaining) {
            if (
              connected.some(
                (other) => Math.hypot(...gap(part, other)) <= 0.101,
              )
            ) {
              connected.push(part);
              remaining.delete(part);
              changed = true;
            }
          }
        }
        expect([...remaining]).toEqual([]);
      });

      it("registers exactly the yawed and pitched lever and raises its 5.6 px bow-facing grip", () => {
        expect(lever).toHaveLength(LEVER_CUBES);
        expect(swatch(21)(lever[0] as Cube)).toBe(true);
        const assemblies = {
          wheel: helm.slice(13, 159),
          throttle_lever: lever,
        };
        expect(() => assertOneAxis(cubes, assemblies)).not.toThrow();
        expect(lever.filter(multipleAxes)).toHaveLength(LEVER_CUBES);
        expect(cubes.filter(multipleAxes)).toEqual(
          expect.arrayContaining([
            ...assemblies.wheel.filter(multipleAxes),
            ...lever,
          ]),
        );
        expect(cubes.filter(multipleAxes)).toHaveLength(140 + LEVER_CUBES);
        const generator = readFileSync("tools/gen_sportsboat.py", "utf8");
        expect(generator).toContain(
          '"throttle_lever": {"owner": "sportsboat", "cubes": 8}',
        );
        const pivot: [number, number, number] = [-12.3, F + 5.7, -3.3];
        const endpoint = (cube: Cube, z: number) =>
          rotate(
            [
              (cube.origin[0] ?? 0) + (cube.size[0] ?? 0) / 2 - pivot[0],
              (cube.origin[1] ?? 0) + (cube.size[1] ?? 0) / 2 - pivot[1],
              z - (pivot[2] ?? 0),
            ],
            cube.rotation ?? [],
          ).map((v, i) => v + (pivot[i] ?? 0));
        const grip = lever[5] as Cube;
        const bar = lever[1] as Cube;
        const far = endpoint(grip, grip.origin[2] ?? 0);
        const near = endpoint(bar, (bar.origin[2] ?? 0) + (bar.size[2] ?? 0));
        expect(far[1]).toBeGreaterThan(pivot[1] ?? 0);
        expect(far[2]).toBeLessThan(pivot[2] ?? 0);
        const length = Math.hypot(...far.map((v, i) => v - (near[i] ?? 0)));
        expect(length).toBeGreaterThanOrEqual(5);
        expect(length).toBeLessThanOrEqual(6);
        expect(length).toBeCloseTo(5.6, 3);
        for (const basis of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]) {
          const expected = rotate(rotate(basis, [0, -6, 0]), [-30, 0, 0]);
          rotate(basis, bar.rotation ?? []).forEach((v, i) => {
            expect(v).toBeCloseTo(expected[i] ?? 0, 4);
          });
        }
      });

      it("uses swatches on every face without a new painted tile", () => {
        expect(Object.keys(tiles).sort()).toEqual(
          ["dial_pad", "display", "mirror", "quilt", "switch_plate"].sort(),
        );
        for (const part of throttle) {
          for (const face of Object.values(part.uv)) {
            expect(face.uv[1]).toBe(1);
            expect(face.uv_size).toEqual([2, 2]);
          }
        }
      });
    });

    it("uses a bounded, disjoint dial tile on the pad and five raised button plates", () => {
      expect(tiles).not.toHaveProperty("control_pad");
      expect(plates).toHaveLength(15);
      for (const cube of plates) {
        const face = cube.uv.up;
        expect(face).toBeDefined();
        for (const axis of [0, 1]) {
          expect(face?.uv[axis]).toBeGreaterThanOrEqual(tile.uv[axis] ?? 0);
          expect(
            (face?.uv[axis] ?? 0) + (face?.uv_size[axis] ?? 0),
          ).toBeLessThanOrEqual(
            (tile.uv[axis] ?? 0) + (tile.size[axis] ?? 0) + 0.0001,
          );
        }
      }
      expect(geometry.description.texture_width).toBe(128);
      expect(geometry.description.texture_height).toBe(32);
      for (const [i, limit] of [128, 32].entries()) {
        expect(tile.size[i]).toBeGreaterThan(0);
        expect(tile.size[i]).toBeLessThanOrEqual(16);
        expect((tile.uv[i] ?? 0) + (tile.size[i] ?? 0)).toBeLessThanOrEqual(
          limit,
        );
      }
      expect(tile.uv[0]).toBeGreaterThanOrEqual(0);
      expect(tile.uv[1]).toBeGreaterThanOrEqual(4);
      for (const [name, other] of Object.entries(tiles)) {
        if (name === "dial_pad") continue;
        expect(
          [0, 1].some(
            (i) =>
              (tile.uv[i] ?? 0) + (tile.size[i] ?? 0) <= (other.uv[i] ?? 0) ||
              (other.uv[i] ?? 0) + (other.size[i] ?? 0) <= (tile.uv[i] ?? 0),
          ),
          name,
        ).toBe(true);
      }
    });

    it("maps only the display's driver-facing surface to its bounded, disjoint UI tile", () => {
      const display = tiles.display as {
        uv: [number, number];
        size: [number, number];
      };
      expect(display).toEqual({ uv: [84, 4], size: [32, 18] });
      expect(display.size[0] / display.size[1]).toBeCloseTo(16 / 9);
      expect(geometry.description.texture_width).toBe(128);
      expect(geometry.description.texture_height).toBe(32);
      for (const [axis, limit] of [128, 32].entries()) {
        expect(
          (display.uv[axis] ?? 0) + (display.size[axis] ?? 0),
        ).toBeLessThanOrEqual(limit);
      }
      for (const [name, other] of Object.entries(tiles)) {
        if (name === "display") continue;
        expect(
          [0, 1].some(
            (axis) =>
              (display.uv[axis] ?? 0) + (display.size[axis] ?? 0) <=
                (other.uv[axis] ?? 0) ||
              (other.uv[axis] ?? 0) + (other.size[axis] ?? 0) <=
                (display.uv[axis] ?? 0),
          ),
          name,
        ).toBe(true);
      }
      const faces = body.filter(
        (cube) => cube.uv.south?.uv[0] === 84 && cube.uv.south?.uv[1] === 4,
      );
      expect(faces).toHaveLength(1);
      expect(faces[0]).toEqual(helm[9]);
      expect(faces[0]?.uv.south).toEqual({
        uv: display.uv,
        uv_size: display.size,
      });
      for (const side of ["north", "east", "west", "up", "down"])
        expect(faces[0]?.uv[side]?.uv).toEqual([49, 1]);
    });

    it("builds a sixteen-sided ribbed cylinder with a solid collar, silver ring and dark top", () => {
      const sections = [
        {
          bottom: 6.72,
          height: 0.13,
          count: 8,
          radius: 0.77,
          solid: true,
          steel: false,
        },
        {
          bottom: 6.85,
          height: 0.5,
          count: 16,
          radius: 0.69,
          solid: false,
          steel: false,
        },
        {
          bottom: 7.32,
          height: 0.06,
          count: 16,
          radius: 0.76,
          solid: false,
          steel: true,
        },
        {
          bottom: 7.38,
          height: 0.06,
          count: 16,
          radius: 0.74,
          solid: false,
          steel: true,
        },
        {
          bottom: 7.35,
          height: 0.09,
          count: 8,
          radius: 0.66,
          solid: true,
          steel: false,
        },
      ];
      for (const section of sections) {
        const panels = controller.filter(
          (cube) =>
            Math.abs(cube.origin[1] - F - section.bottom) < 1e-6 &&
            Math.abs(cube.size[1] - section.height) < 1e-6 &&
            swatch(section.steel ? 16 : 22)(cube),
        );
        expect(panels).toHaveLength(section.count);
        for (const [i, panel] of panels.entries()) {
          expect(panel.pivot?.[0]).toBeCloseTo(-14.4);
          expect(panel.pivot?.[1]).toBeCloseTo(F + section.bottom);
          expect(panel.pivot?.[2]).toBeCloseTo(-7.3);
          expect(panel.rotation).toEqual([0, i * 22.5, 0]);
          expect(panel.size[2]).toBeCloseTo(
            section.solid ? section.radius * 2 : 0.08,
          );
          const width = 2 * section.radius * Math.tan(Math.PI / 16);
          expect(panel.size[0]).toBeCloseTo(
            width * (section.height === 0.5 ? 0.84 : 1),
          );
        }
      }
      expect(
        controller.filter(
          (cube) =>
            Math.abs(cube.origin[1] - F - 6.72) < 1e-6 &&
            Math.abs(cube.size[1] - 0.1) < 1e-6,
        ),
      ).toHaveLength(32);
      for (const cube of controller) {
        expect(
          (cube.rotation ?? []).filter((angle) => Math.abs(angle) > 1e-6)
            .length,
        ).toBeLessThanOrEqual(1);
      }
    });

    it("removes every former phone, dash cupholder, controller and throttle box while retaining the ledge cupholder", () => {
      const removed = [
        [-12.4, F + 8, -12.9],
        [-12.2, F + 8.3, -12.4],
        [-10.9, F + 8, -11.7],
        [-10.65, F + 8.15, -11.45],
        [-15, F + 8, -11.8],
        [-14.4, F + 8.4, -10.8],
        [-14, F + 8.4, -11.2],
        [-13.8, F + 8.9, -10.6],
        [-15.4, F + 4.5, -9],
        [-14.2, F + 7, -8.6],
        [-12.8, F + 7.4, -8.4],
        [-12.6, F + 8.8, -8.1],
      ];
      for (const origin of removed)
        expect(
          body.some((cube) =>
            cube.origin.every(
              (v, i) => Math.abs(v - (origin[i] ?? 0)) < 0.0001,
            ),
          ),
          JSON.stringify(origin),
        ).toBe(false);
      expect(
        body.filter(
          (cube) =>
            cube.origin[0] === -4.9 &&
            cube.origin[1] === F + 7 &&
            cube.origin[2] === -10,
        ),
      ).toHaveLength(1);
      expect(
        body.filter(
          (cube) =>
            Math.abs(cube.origin[0] + 4.65) < 0.0001 &&
            Math.abs(cube.origin[1] - F - 7.15) < 0.0001 &&
            cube.origin[2] === -9.75,
        ),
      ).toHaveLength(1);
    });

    it("fits the former throttle footprint and clears the tilted wheel, display, switch and front seats", () => {
      const dialBounds = bounds(controller);
      expect(dialBounds[0]?.[0]).toBeGreaterThanOrEqual(-15.7);
      expect(dialBounds[0]?.[1]).toBeLessThanOrEqual(-13.1);
      expect(dialBounds[2]?.[0]).toBeGreaterThanOrEqual(-9.3);
      expect(dialBounds[2]?.[1]).toBeLessThanOrEqual(-4.7);
      expect(dialBounds[1]?.[0]).toBeCloseTo(F + 6.5);
      expect(dialBounds[1]?.[1]).toBeCloseTo(F + 7.44);
      const seats = body.filter(
        (cube) =>
          swatch(7)(cube) &&
          cube.origin[1] >= F + 1.8 &&
          cube.origin[2] >= -4 &&
          cube.origin[2] < 4,
      );
      expect(seats.length).toBeGreaterThan(0);
      const obstacles = [
        ...helm.slice(8, 11),
        ...helm.slice(13, 162),
        ...seats,
      ];
      for (const cube of obstacles) {
        const other = bounds([cube]);
        expect(
          dialBounds.some(
            (range, axis) =>
              (range[1] ?? 0) <= (other[axis]?.[0] ?? 0) ||
              (other[axis]?.[1] ?? 0) <= (range[0] ?? 0),
          ),
          JSON.stringify(cube.origin),
        ).toBe(true);
      }
    });

    it("counts the console-through-dial helm at 273 cubes as recorded in ADR 0166", () => {
      expect(controller).toHaveLength(111);
      const next = body[start + 273 + THROTTLE_CUBES];
      expect(next).toBeDefined();
      expect(swatch(4)(next as Cube)).toBe(true);
      const adr = readFileSync(
        "docs/adr/0166-tilted-two-axis-sports-boat-helm-assemblies.md",
        "utf8",
      );
      expect(adr).toContain("174 before and 273 after");
    });
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

    it("does not grow beyond the documented throttle budget (regression guard)", () => {
      expect(cubes.length).toBeLessThanOrEqual(1334 + THROTTLE_CUBES);
    });
  });
});

describe("sports boat PBR rear-view mirror (ADR 0159)", () => {
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
      const { at } = texels(paintAtlas(paint));
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

describe("sports boat gloss hull (ADR 0163) and dash (ADR 0166)", () => {
  // Swatch cells are 4x4 texels in palette order: hull 0, gloss 3, frame 4.
  const MER_BY_CELL: Record<number, number[]> = {
    0: [0, 0, 16, 255],
    3: [0, 0, 24, 255],
    4: [0, 0, 24, 255],
  };

  it.each(PAINTS)(
    "gives %s paint a clear coat only on the hull, gloss and frame swatches",
    (paint) => {
      const name = paintAtlas(paint);
      expect(read(`${ENTITY_TEXTURES}/${name}.texture_set.json`)).toEqual({
        format_version: "1.16.100",
        "minecraft:texture_set": {
          color: name,
          metalness_emissive_roughness: `${name}_mer`,
        },
      });
      const color = readRgbaPng(`${ENTITY_TEXTURES}/${name}.png`);
      const mer = readRgbaPng(`${ENTITY_TEXTURES}/${name}_mer.png`);
      expect([mer.width, mer.height]).toEqual([color.width, color.height]);
      const expected = Buffer.alloc(mer.width * mer.height * 4);
      for (let y = 0; y < mer.height; y++) {
        for (let x = 0; x < mer.width; x++) {
          expected.set(
            (y < 4 && MER_BY_CELL[x >> 2]) || [0, 0, 255, 255],
            (y * mer.width + x) * 4,
          );
        }
      }
      expect(Buffer.from(mer.pixels).equals(expected)).toBe(true);
    },
  );

  it("keeps every face of each hull cube inside the glossy cell", () => {
    type Face = { uv: [number, number]; uv_size: [number, number] };
    type Cube = { uv: Record<string, Face> };
    const cubes: Cube[] = geometry.bones.flatMap(
      (bone: { cubes?: Cube[] }) => bone.cubes ?? [],
    );
    const bounds = ({ uv: [u, v], uv_size: [w, h] }: Face) => ({
      left: Math.min(u, u + w),
      right: Math.max(u, u + w),
      top: Math.min(v, v + h),
      bottom: Math.max(v, v + h),
    });
    const hull = cubes.filter((cube) =>
      Object.values(cube.uv).some((face) => {
        const b = bounds(face);
        return b.left < 4 && b.right > 0 && b.top < 4 && b.bottom > 0;
      }),
    );
    expect(hull.length).toBeGreaterThan(0);
    for (const cube of hull) {
      expect(Object.keys(cube.uv).sort()).toEqual([
        "down",
        "east",
        "north",
        "south",
        "up",
        "west",
      ]);
      for (const face of Object.values(cube.uv)) {
        const b = bounds(face);
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(4);
        expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.bottom).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("sports boat painted tile registry (ADR 0166)", () => {
  it("keeps registered tiles disjoint, below swatches, and at their original pixels", () => {
    const tiles: Record<
      string,
      { uv: [number, number]; size: [number, number] }
    > = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `
import json, sys
sys.path.insert(0, "tools")
import tile_layout
print(json.dumps({name: {"uv": list(uv), "size": list(size)}
                  for name, (uv, size) in tile_layout.TILE_RECTS.items()}))
`,
        ],
        { encoding: "utf8" },
      ),
    );
    expect(tiles.quilt).toEqual({ uv: [0, 16], size: [8, 8] });
    expect(tiles.mirror).toEqual({ uv: [16, 16], size: [16, 8] });
    const atlas = readRgbaPng(`${ENTITY_TEXTURES}/sportsboat.png`);
    const occupied = new Set<number>();
    const hashes: Record<string, string> = {};
    for (const [
      name,
      {
        uv: [u, v],
        size: [w, h],
      },
    ] of Object.entries(tiles)) {
      expect([u, v, w, h].every(Number.isInteger)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(u + w).toBeLessThanOrEqual(atlas.width);
      expect(v + h).toBeLessThanOrEqual(atlas.height);
      const hash = createHash("sha256");
      for (let y = v; y < v + h; y++) {
        for (let x = u; x < u + w; x++) {
          const index = y * atlas.width + x;
          expect(occupied.has(index), name).toBe(false);
          occupied.add(index);
          hash.update(atlas.pixels.subarray(index * 4, (index + 1) * 4));
        }
      }
      hashes[name] = hash.digest("hex");
    }
    // Hash decoded RGBA rectangles so PNG compression changes do not affect the pixel contract.
    expect(hashes.quilt).toBe(
      "2149d1ffbb0565f065e69265c270e62b9cb904ed6bc662bee2649e197fa04374",
    );
    expect(hashes.mirror).toBe(
      "64f9de190f4cb9d31792ec8c503eb799c65caee4fd38b3f22f00b9cf7082aab5",
    );
  });
});
