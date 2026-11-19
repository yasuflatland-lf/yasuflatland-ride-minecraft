import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { PAINT_VARIANT } from "../../src/infrastructure/shared/dyes";
import { defined } from "../support/defined";
import {
  type Bone,
  type Triple,
  turn,
  turnedCorners,
} from "../support/geometry";
import { readRgbaPng } from "../support/png";
import { loadScooterGeo } from "../tools/helpers/scooterGeo";

const RP = "packs/yasu_ride_rp";
const read = (path: string) =>
  JSON.parse(readFileSync(`${RP}/${path}`, "utf8"));
const client = read("entity/yasu_ride/scooter.ce.json")[
  "minecraft:client_entity"
].description;
const suv = read("entity/yasu_ride/suv.ce.json")["minecraft:client_entity"]
  .description;
type Entry = string | Record<string, string>;
interface State {
  animations?: Entry[];
  transitions: Record<string, string>[];
  blend_transition?: number;
}
interface Controller {
  initial_state: string;
  states: Record<string, State>;
}
interface Pose {
  rotation: Triple;
  position: Triple;
}
interface Effect {
  effect: string;
  locator?: string;
}
interface Animation {
  bones?: Record<
    string,
    {
      rotation?: (number | string)[] | Record<string, Triple>;
      position?: Triple | Record<string, Triple>;
    }
  >;
  sound_effects?: Record<string, Effect | Effect[]>;
  particle_effects?: Record<string, Effect | Effect[]>;
}
const animations: Record<string, Animation> = read(
  "animations/yasu_ride/scooter.anim.json",
).animations;
const controllers: Record<string, Controller> = read(
  "animation_controllers/yasu_ride/scooter.ac.json",
).animation_controllers;
const renders = read(
  "render_controllers/yasu_ride/scooter.rc.json",
).render_controllers;
const renderId = "controller.render.yasu_ride.scooter";
const form = defined(
  controllers["controller.animation.yasu_ride.scooter.form"],
  "form",
);
const stand = defined(
  controllers["controller.animation.yasu_ride.scooter.stand"],
  "stand",
);
const bones = loadScooterGeo().bones as (Bone & {
  locators?: Record<string, Triple>;
})[];
const bone = (name: string) =>
  defined(
    bones.find((b) => b.name === name),
    name,
  );
const clip = (name: string) =>
  defined(animations[`animation.yasu_ride.scooter.${name}`], name);
const points = (name: string) =>
  (bone(name).cubes ?? []).flatMap((cube) => turnedCorners(bone(name), cube));
const nameOf = (entry: Entry) =>
  typeof entry === "string" ? entry : defined(Object.keys(entry)[0], "entry");
const add = (a: Triple, b: Triple): Triple => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const low = (samples: Triple[]) => Math.min(...samples.map((p) => p[1]));
const high = (samples: Triple[]) => Math.max(...samples.map((p) => p[1]));
const effects = (timeline: Record<string, Effect | Effect[]> | undefined) =>
  Object.values(timeline ?? {}).flat();

describe("scooter client references", () => {
  it("resolves all animations, controllers, bones and playback entries", () => {
    expect(client.identifier).toBe("yasu_ride:scooter");
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.scooter",
      paint: "geometry.yasu_ride.scooter_paint",
      lit: "geometry.yasu_ride.scooter_lit",
    });
    const available = { ...animations, ...controllers };
    expect(Object.values(client.animations).sort()).toEqual(
      Object.keys(available).sort(),
    );
    for (const animation of Object.values(animations)) {
      for (const name of Object.keys(animation.bones ?? {}))
        expect(bone(name)).toBeDefined();
    }
    for (const controller of Object.values(controllers)) {
      for (const state of Object.values(controller.states)) {
        for (const entry of state.animations ?? [])
          expect(animations[client.animations[nameOf(entry)]]).toBeDefined();
        for (const transition of state.transitions)
          expect(controller.states[nameOf(transition)]).toBeDefined();
      }
    }
    for (const entry of client.scripts.animate as Entry[])
      expect(available[client.animations[nameOf(entry)]]).toBeDefined();
    expect(client.scripts.animate).toEqual([
      "form",
      "stand",
      "lean",
      "steer",
      ...suv.scripts.animate.filter((entry: Entry) =>
        nameOf(entry).startsWith("engine_sound_"),
      ),
      ...Array.from({ length: 6 }, (_, i) => ({
        [`exhaust_${i}`]: client.scripts.animate.find(
          (entry: Entry) => nameOf(entry) === `engine_sound_${i}`,
        )[`engine_sound_${i}`],
      })),
    ]);
  });

  it("emits exhaust only with a rider in road form across all speed boundaries", () => {
    const gates = Object.assign(
      {},
      ...client.scripts.animate.filter(
        (entry: Entry) => typeof entry !== "string",
      ),
    );
    const smoke = Object.keys(client.animations).filter((name) =>
      name.startsWith("exhaust_"),
    );
    expect(smoke).toHaveLength(6);
    for (const name of smoke) {
      const index = name.slice("exhaust_".length);
      expect(effects(clip(name).particle_effects)).toHaveLength(
        defined([4, 6, 9, 12, 16, 20][Number(index)], name),
      );
      expect(gates[name]).toBe(gates[`engine_sound_${index}`]);
      for (const particle of effects(clip(name).particle_effects)) {
        expect(particle).toEqual({
          effect: "exhaust_smoke",
          locator: "exhaust",
        });
        expect(client.particle_effects[particle.effect]).toBe(
          "yasu_ride:exhaust_smoke",
        );
        expect(
          bones.some((b) =>
            Object.hasOwn(b.locators ?? {}, particle.locator ?? ""),
          ),
        ).toBe(true);
      }
    }
    for (const hasRider of [false, true]) {
      for (const currentForm of ["car", "takeoff", "hover", "landing"]) {
        for (const speed of [
          0, 0.999, 1, 4.499, 4.5, 7.999, 8, 11.499, 11.5, 14.999, 15, 30,
        ]) {
          const active = smoke.filter((name) => {
            const expression = gates[name]
              .replaceAll("query.has_rider", String(hasRider))
              .replaceAll(
                "query.property('yasu_ride:form')",
                JSON.stringify(currentForm),
              )
              .replaceAll("query.ground_speed", String(speed));
            return new Function(`return (${expression});`)();
          });
          const band =
            speed < 1
              ? 0
              : speed < 4.5
                ? 1
                : speed < 8
                  ? 2
                  : speed < 11.5
                    ? 3
                    : speed < 15
                      ? 4
                      : 5;
          expect(active).toEqual(
            hasRider && currentForm === "car" ? [`exhaust_${band}`] : [],
          );
        }
      }
    }
  });

  it("binds every paint variant and texture in the SUV order", () => {
    expect(
      Object.keys(client.textures).filter((key) => key !== "fixed"),
    ).toEqual(Object.keys(suv.textures));
    const slots: string[] =
      renders[`${renderId}.paint`].arrays.textures["Array.paints"];
    expect(slots).toHaveLength(PAINTS.length);
    for (const paint of PAINTS) {
      const key = defined(slots[PAINT_VARIANT[paint]], paint).replace(
        "Texture.",
        "",
      );
      expect(client.textures[key]).toBe(
        `textures/entity/yasu_ride/scooter_paint${paint === "khaki" || paint === "white" ? "" : `_${paint}`}`,
      );
    }
    for (const texture of Object.values(client.textures)) {
      expect(existsSync(`${RP}/${texture}.png`), String(texture)).toBe(true);
      const textureSet = read(`${texture}.texture_set.json`)[
        "minecraft:texture_set"
      ];
      for (const name of [
        textureSet.color,
        textureSet.metalness_emissive_roughness,
      ]) {
        if (typeof name !== "string") {
          expect(name).toEqual([0, 0, 90]);
          continue;
        }
        expect(
          existsSync(`${RP}/textures/entity/yasu_ride/${name}.png`),
          name,
        ).toBe(true);
      }
    }
  });

  it("resolves scooter engine sounds, shared hover sounds and the hover particle at both disc locators", () => {
    const sounds = read("sounds/sound_definitions.json").sound_definitions;
    for (const animation of Object.values(animations)) {
      for (const effect of effects(animation.sound_effects))
        expect(client.sound_effects[effect.effect]).toBeDefined();
    }
    expect(Object.keys(client.sound_effects)).toEqual([
      ...Array.from({ length: 6 }, (_, i) => `scooter_engine_${i}`),
      ...Object.keys(suv.sound_effects).filter((key) =>
        key.startsWith("hover_"),
      ),
    ]);
    for (const [key, sound] of Object.entries(client.sound_effects)) {
      expect(sound).toBe(`yasu_ride.${key}`);
      expect(sounds[String(sound)]).toBeDefined();
    }
    for (let i = 0; i < 6; i++) {
      for (const field of ["category", "min_distance", "max_distance"]) {
        expect(sounds[`yasu_ride.scooter_engine_${i}`][field]).toEqual(
          sounds[`yasu_ride.engine_${i}`][field],
        );
      }
    }
    expect(client.particle_effects).toEqual({
      exhaust_smoke: read("particles/yasu_ride/exhaust_smoke.particle.json")
        .particle_effect.description.identifier,
      hover_glow: read("particles/yasu_ride/hover_glow.particle.json")
        .particle_effect.description.identifier,
    });
    const particles = effects(clip("hover_glow").particle_effects);
    expect(particles.map((p) => p.locator).sort()).toEqual([
      "hover_front",
      "hover_rear",
    ]);
    for (const particle of particles) {
      expect(particle.effect).toBe("hover_glow");
      expect(
        bones.some((b) =>
          Object.hasOwn(b.locators ?? {}, particle.locator ?? ""),
        ),
      ).toBe(true);
    }
  });
});

describe("scooter controllers", () => {
  it("uses only the four ground and hover states with the shared sound gates", () => {
    expect(form.initial_state).toBe("ground");
    expect(Object.keys(form.states)).toEqual([
      "ground",
      "deploy",
      "hover",
      "retract",
    ]);
    const suvForm: Controller = read(
      "animation_controllers/yasu_ride/suv.ac.json",
    ).animation_controllers["controller.animation.yasu_ride.suv.form"];
    for (const name of ["deploy", "hover", "retract"])
      expect(form.states[name]).toEqual(suvForm.states[name]);
    expect(form.states.ground).toEqual({
      animations: ["wheels"],
      transitions: [{ deploy: "!query.property('yasu_ride:gear_down')" }],
    });
    expect(JSON.stringify({ client, controllers, animations })).not.toContain(
      "submarine",
    );
  });

  it("raises the stand when the stand property is false with short blends", () => {
    expect(stand.initial_state).toBe("down");
    expect(Object.keys(stand.states)).toEqual(["down", "up"]);
    expect(stand.states.down).not.toHaveProperty("animations");
    expect(stand.states.up?.animations).toEqual(["stand_up"]);
    expect(stand.states.down?.transitions).toEqual([
      { up: "!query.property('yasu_ride:stand')" },
    ]);
    expect(stand.states.up?.transitions).toEqual([
      { down: "query.property('yasu_ride:stand')" },
    ]);
    for (const state of Object.values(stand.states)) {
      expect(state.blend_transition).toBeGreaterThan(0);
      expect(state.blend_transition).toBeLessThan(1);
    }
  });

  it("draws fixed and paint cutouts, a separate hover glow, then the lit lamps last", () => {
    const main = loadScooterGeo();
    const lit = read("models/entity/yasu_ride/scooter_lit.geo.json")[
      "minecraft:geometry"
    ][0];
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.scooter",
      paint: "geometry.yasu_ride.scooter_paint",
      lit: "geometry.yasu_ride.scooter_lit",
    });
    expect(lit.description.identifier).toBe("geometry.yasu_ride.scooter_lit");
    const image = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/scooter_lit.png`,
    );
    expect([
      lit.description.texture_width,
      lit.description.texture_height,
    ]).toEqual([image.width, image.height]);
    const litBones = lit.bones as (Omit<Bone, "cubes"> & {
      cubes: (NonNullable<Bone["cubes"]>[number] & {
        uv: Record<string, unknown>;
      })[];
    })[];
    expect(litBones.map((b) => b.name)).toEqual(bones.map((b) => b.name));
    for (const [index, b] of litBones.entries()) {
      const original = defined(main.bones[index], b.name);
      const originalCubes = original.cubes ?? [];
      const { cubes: _cubes, ...metadata } = b;
      const { cubes: _originalCubes, ...originalMetadata } = original;
      expect(metadata).toEqual(originalMetadata);
      const kept =
        ["headlights", "tail_lights"].includes(b.name) ||
        b.name.startsWith("glow_");
      expect(b.cubes?.length ?? 0).toBe(kept ? originalCubes.length : 0);
      for (const [cubeIndex, cube] of (b.cubes ?? []).entries()) {
        const { uv, ...shape } = cube;
        const { uv: originalUv, ...originalShape } = defined(
          originalCubes[cubeIndex],
          "cube",
        );
        expect(shape).toEqual(originalShape);
        expect(Object.keys(uv ?? {})).toEqual(Object.keys(originalUv));
      }
    }
    const headlights = "query.property('yasu_ride:headlights')";
    const gearUp = "!query.property('yasu_ride:gear_down')";
    expect(client.materials).toEqual({
      default: "entity_alphatest",
      lamp: "entity",
      lamp_lit: "entity_emissive",
    });
    expect(client.render_controllers).toEqual([
      renderId,
      `${renderId}.paint`,
      { [`${renderId}.glow`]: gearUp },
      { [`${renderId}.lit`]: headlights },
    ]);
    expect(renders[renderId].geometry).toBe("Geometry.default");
    expect(renders[renderId].textures).toEqual(["Texture.fixed"]);
    expect(renders[`${renderId}.paint`]).toEqual({
      arrays: {
        textures: {
          "Array.paints": PAINTS.map(
            (paint) => `Texture.${paint === "khaki" ? "default" : paint}`,
          ),
        },
      },
      geometry: "Geometry.paint",
      textures: ["Array.paints[query.variant]"],
      materials: renders[renderId].materials,
      part_visibility: renders[renderId].part_visibility,
    });
    expect(renders[renderId].materials).toEqual([
      { "*": "Material.default" },
      { headlights: "Material.lamp" },
      { tail_lights: "Material.lamp" },
    ]);
    expect(renders[renderId].part_visibility).toEqual([
      { "*": true },
      { "glow_*": false },
      { headlights: `!${headlights}` },
      { tail_lights: `!${headlights}` },
    ]);
    for (const [suffix, visibility] of [
      ["glow", [{ "*": false }, { "glow_*": gearUp }]],
      ["lit", [{ "*": false }, { headlights }, { tail_lights: headlights }]],
    ] as const) {
      expect(renders[`${renderId}.${suffix}`]).toEqual({
        geometry: "Geometry.lit",
        textures: ["Texture.lit"],
        materials: [{ "*": "Material.lamp_lit" }],
        part_visibility: visibility,
      });
    }
  });
});

describe("scooter generated poses", () => {
  it("folds each horizontal wheel below every fixed cube with discs and locators underneath", () => {
    const fixedLow = low(
      ["body", "steer", "headlights", "tail_lights"].flatMap(points),
    );
    for (const side of ["front", "rear"]) {
      const foldName = `wheel_${side}_fold`;
      const pivot = defined(bone(foldName).pivot, foldName);
      const folded = clip("wheels_folded").bones?.[foldName] as Pose;
      const deploy = clip("wheels_deploy").bones?.[foldName] as {
        rotation: Record<string, Triple>;
        position: Record<string, Triple>;
      };
      const endpoint = {
        rotation: defined(deploy.rotation["1.0"], "rotation"),
        position: defined(deploy.position["1.0"], "position"),
      };
      expect(endpoint).toEqual(folded);
      for (const pose of [folded, endpoint]) {
        const transform = (p: Triple) =>
          add(turn(p, pivot, pose.rotation), pose.position);
        const original = points(`wheel_${side}`);
        const wheel = original.map(transform);
        expect(high(wheel), side).toBeLessThan(fixedLow);
        const axle = turn([1, 0, 0], [0, 0, 0], pose.rotation);
        expect(Math.abs(axle[1])).toBeCloseTo(1, 10);
        expect(axle[0]).toBeCloseTo(0, 10);
        expect(axle[2]).toBeCloseTo(0, 10);
        const width =
          Math.max(...original.map((p) => p[0])) -
          Math.min(...original.map((p) => p[0]));
        expect(high(wheel) - low(wheel)).toBeLessThanOrEqual(width + 1e-8);
        const glow = bone(`glow_${side}`);
        expect(glow.parent).toBe(foldName);
        const disc = points(glow.name).map(transform);
        expect(high(disc)).toBeLessThan(low(wheel));
        const locator = defined(
          glow.locators?.[`hover_${side}`],
          "hover locator",
        );
        expect(transform(locator)[1]).toBeLessThanOrEqual(low(disc) + 1e-8);
      }
    }
  });

  it("keeps the inclined steering axis fixed and turns the front wheel edge toward positive x", () => {
    const pivot = defined(bone("steer").pivot, "steer pivot");
    const axle = defined(bone("wheel_front").pivot, "front axle");
    const axisDegrees = Number(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          "import sys; sys.path.insert(0, 'tools'); from tool_loader import load_tool; print(load_tool('scooter_dims').STEERING_AXIS_DEGREES)",
        ],
        { encoding: "utf8" },
      ),
    );
    const a = (axisDegrees * Math.PI) / 180;
    const degrees = (r: number) => (r * 180) / Math.PI;
    const radians = (d: number) => (d * Math.PI) / 180;
    const math = {
      sin: (d: number) => Math.sin(radians(d)),
      cos: (d: number) => Math.cos(radians(d)),
      asin: (v: number) => degrees(Math.asin(v)),
      atan2: (y: number, x: number) => degrees(Math.atan2(y, x)),
    };
    const expressions = clip("steer").bones?.steer?.rotation as string[];
    expect(expressions).toHaveLength(3);
    for (const steer of [-60, -30, 0, 15, 30, 60]) {
      const rotation = expressions.map((expression) => {
        const substituted = expression.replaceAll(
          "query.property('yasu_ride:steer')",
          `(${steer})`,
        );
        return new Function("math", `return (${substituted});`)(math) as number;
      }) as Triple;
      for (const distance of [-20, 0, 20]) {
        const p = add(pivot, [
          0,
          distance * Math.cos(a),
          distance * Math.sin(a),
        ]);
        const moved = turn(p, pivot, rotation);
        for (const i of [0, 1, 2] as const)
          expect(moved[i]).toBeCloseTo(p[i], 4);
      }
      const movedAxle = turn(axle, pivot, rotation);
      // Geometry pivots are rounded to three decimals by the generator.
      for (const i of [0, 1, 2] as const)
        expect(movedAxle[i]).toBeCloseTo(axle[i], 3);
      if (steer > 0)
        expect(turn(add(axle, [0, 0, -1]), pivot, rotation)[0]).toBeGreaterThan(
          0,
        );
    }
  });

  it("raises every stand corner above one pixel and leaves its hinge outside the fold", () => {
    const standBone = bone("stand");
    const pivot = defined(standBone.pivot, "stand pivot");
    const rotation = clip("stand_up").bones?.stand?.rotation as Triple;
    expect(
      low(points("stand").map((p) => turn(p, pivot, rotation))),
    ).toBeGreaterThan(1);
    const fold = defined(clip("wheels_folded").bones, "fold bones");
    let ancestor: Bone | undefined = standBone;
    while (ancestor) {
      expect(fold[ancestor.name]).toBeUndefined();
      ancestor = bones.find((b) => b.name === ancestor?.parent);
    }
    expect(turn(pivot, pivot, rotation)).toEqual(pivot);
  });
});
