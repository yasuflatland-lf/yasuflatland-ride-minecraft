import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bone, bones, RP } from "./helpers";

interface ParticleEffect {
  effect: string;
  locator: string;
}
interface SoundEffect {
  effect: string;
}
type Keyframes<T> = T | Record<string, T>;
interface BonePose {
  rotation?: Keyframes<unknown[]>;
  position?: Keyframes<unknown[]>;
}
interface CamperAnimation {
  animation_length?: number;
  loop?: boolean;
  bones?: Record<string, BonePose>;
  particle_effects?: Record<string, ParticleEffect | ParticleEffect[]>;
  sound_effects?: Record<string, SoundEffect | SoundEffect[]>;
}
interface ControllerState {
  animations: (string | Record<string, string>)[];
  transitions: Record<string, string>[];
}
interface Controller {
  initial_state: string;
  states: Record<string, ControllerState>;
}

const camperClient = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
)["minecraft:client_entity"].description;
const camperAnimations: Record<string, CamperAnimation> = JSON.parse(
  readFileSync(`${RP}/animations/yasu_ride/camper.anim.json`, "utf8"),
).animations;
const camperControllers: Record<string, Controller> = JSON.parse(
  readFileSync(`${RP}/animation_controllers/yasu_ride/camper.ac.json`, "utf8"),
).animation_controllers;
const camperForm = camperControllers[
  "controller.animation.yasu_ride.camper.form"
] as Controller;
const suvClient = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/suv.ce.json`, "utf8"),
)["minecraft:client_entity"].description;
const suvAnimations: Record<string, CamperAnimation> = JSON.parse(
  readFileSync(`${RP}/animations/yasu_ride/suv.anim.json`, "utf8"),
).animations;
const suvForm: Controller = JSON.parse(
  readFileSync(`${RP}/animation_controllers/yasu_ride/suv.ac.json`, "utf8"),
).animation_controllers["controller.animation.yasu_ride.suv.form"];
const WHEELS = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];
const camperAnimation = (name: string): CamperAnimation => {
  const found = camperAnimations[`animation.yasu_ride.camper.${name}`];
  expect(found, name).toBeDefined();
  return found as CamperAnimation;
};
// A conditional entry in a state's animations or in scripts.animate is { name: condition }.
const shortName = (entry: string | Record<string, string>): string =>
  typeof entry === "string" ? entry : (Object.keys(entry)[0] ?? "");
const effectsOf = <T>(byTime: Record<string, T | T[]> | undefined): T[] =>
  Object.values(byTime ?? {}).flat() as T[];

describe("camper animation references", () => {
  it("resolves every client animation to a camper animation or controller", () => {
    const names = new Set([
      ...Object.keys(camperAnimations),
      ...Object.keys(camperControllers),
    ]);
    expect(Object.keys(camperClient.animations)).toHaveLength(31);
    for (const name of Object.values(camperClient.animations)) {
      expect(names.has(String(name)), String(name)).toBe(true);
    }
  });

  it("animates only root, the wheels, the entry door, the shower door, and the storage doors present in the model", () => {
    const allowed = [
      "root",
      "wheel_fl",
      "wheel_fr",
      "wheel_rl",
      "wheel_rr",
      "door_entry",
      "shower_door",
      "cabinet_sink_door",
      "cabinet_stove_door",
      "fridge_top_door",
      "fridge_bottom_door",
    ];
    const modelBones = bones.map((b) => b.name);
    for (const animation of Object.values(camperAnimations)) {
      for (const name of Object.keys(animation.bones ?? {})) {
        expect(allowed).toContain(name);
        expect(modelBones).toContain(name);
      }
    }
  });

  it("resolves every client sound effect to an existing sound definition", () => {
    const sounds = JSON.parse(
      readFileSync(`${RP}/sounds/sound_definitions.json`, "utf8"),
    ).sound_definitions;
    expect(Object.keys(camperClient.sound_effects)).toHaveLength(14);
    const soundNames = Object.keys(sounds);
    for (const sound of Object.values(camperClient.sound_effects)) {
      expect(soundNames).toContain(sound);
    }
  });

  it("emits hover glow at all four locators present in the model", () => {
    const glow = camperAnimations["animation.yasu_ride.camper.hover_glow"];
    const effects = Object.values(glow?.particle_effects ?? {}).flat();
    expect(effects.map((effect) => effect.locator).sort()).toEqual([
      "hover_fl",
      "hover_fr",
      "hover_rl",
      "hover_rr",
    ]);
    const locators = bones.flatMap((b) => Object.keys(b.locators ?? {}));
    for (const effect of effects) {
      expect(effect.effect).toBe("hover_glow");
      expect(locators).toContain(effect.locator);
    }
  });

  it("plays only camper animations from every form controller state", () => {
    for (const [state, { animations }] of Object.entries(camperForm.states)) {
      for (const entry of animations) {
        const id = camperClient.animations[shortName(entry)];
        expect(id, `${state}: ${shortName(entry)}`).toBeDefined();
        expect(camperAnimations[id], `${state}: ${id}`).toBeDefined();
      }
    }
  });

  it("keeps the SUV form controller's states and transitions", () => {
    expect(camperForm).toEqual(suvForm);
    const states = Object.keys(camperForm.states);
    expect(states).toContain(camperForm.initial_state);
    for (const { transitions } of Object.values(camperForm.states))
      for (const transition of transitions)
        for (const target of Object.keys(transition))
          expect(states).toContain(target);
  });

  it("animates only names the client entity defines, as the SUV does", () => {
    expect(camperClient.scripts.animate).toEqual([
      ...suvClient.scripts.animate,
      "door",
      "shower_door",
      "cabinet_sink_door",
      "cabinet_stove_door",
      "fridge_top_door",
      "fridge_bottom_door",
      { shower: "q.property('yasu_ride:shower')" },
      { shower_sound: "q.property('yasu_ride:shower')" },
    ]);
    for (const entry of camperClient.scripts.animate)
      expect(Object.keys(camperClient.animations)).toContain(shortName(entry));
  });

  it("plays only sound and particle effects the client entity defines, at locators in the model", () => {
    const sounds = Object.keys(camperClient.sound_effects);
    const particles = Object.keys(camperClient.particle_effects);
    const locators = bones.flatMap((b) => Object.keys(b.locators ?? {}));
    expect(camperClient.particle_effects).toEqual({
      ...suvClient.particle_effects,
      shower: "yasu_ride:shower_spray",
    });
    for (const [name, animation] of Object.entries(camperAnimations)) {
      for (const sound of effectsOf(animation.sound_effects))
        expect(sounds, name).toContain(sound.effect);
      for (const particle of effectsOf(animation.particle_effects)) {
        expect(particles, name).toContain(particle.effect);
        expect(locators, name).toContain(particle.locator);
      }
    }
  });

  it("rotates the shower door by its property and sprays at the shower head only while the shower runs (ADR 0094)", () => {
    const door = camperAnimation("shower_door");
    expect(door.loop).toBe(true);
    expect(door.bones).toEqual({
      shower_door: {
        rotation: [0, "q.property('yasu_ride:shower_door') * -90", 0],
      },
    });
    const spray = camperAnimation("shower");
    expect(spray.animation_length).toBe(0.1);
    expect(effectsOf(spray.particle_effects)).toEqual([
      { effect: "shower", locator: "shower_head" },
    ]);
    const sound = camperAnimation("shower_sound");
    expect(sound.animation_length).toBe(1);
    expect(effectsOf(sound.sound_effects)).toEqual([{ effect: "shower" }]);
    const particle = JSON.parse(
      readFileSync(
        `${RP}/particles/yasu_ride/shower_spray.particle.json`,
        "utf8",
      ),
    ).particle_effect.description.identifier;
    expect(camperClient.particle_effects.shower).toBe(particle);
    expect(camperClient.sound_effects.shower).toBe("yasu_ride.shower");
    const definition = JSON.parse(
      readFileSync(`${RP}/sounds/sound_definitions.json`, "utf8"),
    ).sound_definitions["yasu_ride.shower"];
    const wavs = readdirSync(`${RP}/sounds/yasu_ride`);
    for (const { name } of definition.sounds as { name: string }[])
      expect(wavs).toContain(`${name.split("/").at(-1)}.wav`);
  });

  it("swings each wall cabinet door by its own property, the one over the sink and the one over the stove each way into the aisle (ADR 0114)", () => {
    expect(camperAnimation("cabinet_sink_door")).toEqual({
      loop: true,
      bones: {
        cabinet_sink_door: {
          rotation: [0, "q.property('yasu_ride:cabinet_sink_door') * 90", 0],
        },
      },
    });
    expect(camperAnimation("cabinet_stove_door")).toEqual({
      loop: true,
      bones: {
        cabinet_stove_door: {
          rotation: [0, "q.property('yasu_ride:cabinet_stove_door') * -90", 0],
        },
      },
    });
  });

  it("swings each fridge door by its own property into the aisle, both the way the sink cabinet door turns, since both are hinged at their front ends (ADR 0123)", () => {
    for (const door of ["fridge_top_door", "fridge_bottom_door"])
      expect(camperAnimation(door)).toEqual({
        loop: true,
        bones: {
          [door]: {
            rotation: [0, `q.property('yasu_ride:${door}') * 90`, 0],
          },
        },
      });
  });

  it("matches wheel spin to the circumference derived from each wheel pivot", () => {
    for (const w of WHEELS) {
      const rotation = camperAnimation("wheels").bones?.[w]
        ?.rotation as unknown[];
      const expression = String(rotation[0]);
      expect(expression).toMatch(
        /^-query\.modified_distance_moved \* \d+\.\d$/,
      );
      const coefficient = Number(expression.split(" * ")[1]);
      const radius = bone(w).pivot[1] ?? 0;
      expect(coefficient, w).toBeCloseTo(
        360 / ((2 * Math.PI * radius) / 16),
        1,
      );
      expect(rotation.slice(1)).toEqual([0, 0]);
    }
  });

  it("folds the wheels with the SUV's rotation and lifts them 2.7 px below the floor", () => {
    const deploy = camperAnimation("wheels_deploy");
    const suvDeploy = suvAnimations[
      "animation.yasu_ride.suv.wheels_deploy"
    ] as CamperAnimation;
    expect(deploy.animation_length).toBe(1);
    expect(effectsOf(deploy.sound_effects)).toEqual([
      { effect: "hover_start" },
    ]);
    expect(Object.keys(deploy.sound_effects ?? {})).toEqual(["0.0"]);
    for (const w of WHEELS) {
      expect(deploy.bones?.[w]?.rotation, w).toEqual(
        suvDeploy.bones?.[w]?.rotation,
      );
      expect(deploy.bones?.[w]?.position, w).toEqual({
        "0.0": [0, 0, 0],
        "1.0": [0, 2.7, 0],
      });
      const position = deploy.bones?.[w]?.position as Record<string, number[]>;
      expect((bone(w).pivot[1] ?? 0) + (position["1.0"]?.[1] ?? 0) + 2, w).toBe(
        12.5,
      );
    }
  });

  it("holds the folded pose deploy ends at and retracts back out of it", () => {
    const deploy = camperAnimation("wheels_deploy");
    const folded = camperAnimation("wheels_folded");
    const retract = camperAnimation("wheels_retract");
    expect(folded.loop).toBe(true);
    expect(retract.animation_length).toBe(1);
    expect(retract.sound_effects).toBeUndefined();
    for (const w of WHEELS) {
      for (const channel of ["rotation", "position"] as const) {
        const keys = deploy.bones?.[w]?.[channel] as Record<string, unknown>;
        expect(folded.bones?.[w]?.[channel], `${w} ${channel}`).toEqual(
          keys["1.0"],
        );
        expect(retract.bones?.[w]?.[channel], `${w} ${channel}`).toEqual({
          "0.0": keys["1.0"],
          "1.0": keys["0.0"],
        });
      }
    }
  });

  it("dives, stays submerged, and surfaces in the deploy, folded, and retract poses without sound", () => {
    const pairs = [
      ["dive", "wheels_deploy"],
      ["submerged", "wheels_folded"],
      ["surface", "wheels_retract"],
    ] as const;
    for (const [water, air] of pairs) {
      const underwater = camperAnimation(water);
      const flight = camperAnimation(air);
      expect(underwater.bones, water).toEqual(flight.bones);
      expect(underwater.animation_length, water).toBe(flight.animation_length);
      expect(underwater.loop, water).toBe(flight.loop);
      expect(underwater.sound_effects, water).toBeUndefined();
    }
  });
});
