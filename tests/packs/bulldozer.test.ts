import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { BULLDOZER_PROFILE } from "../../src/domain/vehicle/kinds/bulldozer/profile";
import { BULLDOZER_SPEC } from "../../src/domain/vehicle/kinds/bulldozer/spec";
import { FORMS } from "../../src/domain/vehicle/motion/forms";
import { expectContiguous, speedRanges } from "../support/soundLevels";

const RP = "packs/yasu_ride_rp",
  BP = "packs/yasu_ride_bp";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const entity = read(`${BP}/entities/yasu_ride/bulldozer.se.json`)[
  "minecraft:entity"
];
const client = read(`${RP}/entity/yasu_ride/bulldozer.ce.json`)[
  "minecraft:client_entity"
].description;
const anim = read(`${RP}/animations/yasu_ride/bulldozer.anim.json`).animations;
const controller = read(
  `${RP}/animation_controllers/yasu_ride/bulldozer.ac.json`,
).animation_controllers["controller.animation.yasu_ride.bulldozer.form"];
const render = read(`${RP}/render_controllers/yasu_ride/bulldozer.rc.json`)
  .render_controllers["controller.render.yasu_ride.bulldozer"];
it("is a vehicle entity with the touch Jump components and a body that follows the view (ADR 0025, 0136)", () => {
  const c = entity.components;
  expect(c["minecraft:type_family"]).toEqual({
    family: ["yasu_ride_vehicle", "inanimate"],
  });
  for (const k of [
    "input_ground_controlled",
    "can_power_jump",
    "body_rotation_always_follows_head",
  ])
    expect(c[`minecraft:${k}`]).toEqual({});
  expect(c["minecraft:horse.jump_strength"]).toEqual({ value: 0 });
  expect(c["minecraft:collision_box"]).toEqual({ width: 2.4, height: 2.9 });
  expect(c["minecraft:variable_max_auto_step"].base_value).toBe(1.0625);
});
it("uses the entity format that makes its damage sensor effective, like the other vehicles", () => {
  // Under format 1.21.0 the same damage_sensor let a fall kill the bulldozer
  // while the SUV, camper, and boat on 1.21.80 took no damage.
  const file = read(`${BP}/entities/yasu_ride/bulldozer.se.json`);
  expect(file.format_version).toBe("1.21.80");
  expect(entity.components["minecraft:damage_sensor"].triggers).toEqual({
    cause: "all",
    deals_damage: "no",
  });
});
it("declares the transforming properties with a nonzero range for its zero bank", () => {
  const p = entity.description.properties;
  expect(p["yasu_ride:form"].values).toEqual(FORMS);
  // BDS 1.26.52.3 rejects [0.0, 0.0]: "range max is less than range min" (ADR 0136).
  expect(p["yasu_ride:bank"]).toEqual({
    type: "float",
    range: [0, 1],
    default: 0,
    client_sync: true,
  });
  expect(p["yasu_ride:blade"]).toEqual({
    type: "float",
    range: [0, 1],
    default: 1,
    client_sync: true,
  });
  expect(p["yasu_ride:blade"].default).toBe(
    BULLDOZER_SPEC.bladeRaisedOnSpawn ? 1 : 0,
  );
  expect(p["yasu_ride:gear_down"].default).toBe(true);
  for (const key of ["bank", "spin_r", "spin_l", "door", "blade"]) {
    const text = readFileSync(
      `${BP}/entities/yasu_ride/bulldozer.se.json`,
      "utf8",
    );
    const definition = text.slice(text.indexOf(`"yasu_ride:${key}"`));
    expect(definition.slice(0, definition.indexOf('"default"'))).toMatch(
      /"range": \[\s*\d+\.0/,
    );
  }
});
it("seats one driver at the cab seat", () =>
  expect(entity.components["minecraft:rideable"]).toMatchObject({
    seat_count: 1,
    controlling_seat: 0,
    seats: [{ position: [0, 1.4, -1.35], lock_rider_rotation: 90 }],
  }));
it("matches the seat and collision box to the profile", () => {
  expect(
    entity.components["minecraft:rideable"].seats.map(
      (s: { position: number[] }) => ({ x: s.position[0], z: s.position[2] }),
    ),
  ).toEqual(BULLDOZER_PROFILE.seats.positions);
  expect(entity.components["minecraft:collision_box"].height).toBe(
    BULLDOZER_PROFILE.body.height,
  );
});
it("switches gravity with the shared groups and paints with the 16 dye events", () => {
  for (const p of PAINTS)
    expect(entity.events[`yasu_ride:paint_${p}`]).toBeDefined();
  for (const g of ["weighted", "weightless"])
    expect(entity.component_groups[`yasu_ride:${g}`]).toBeDefined();
  for (const e of ["gravity_on", "gravity_off"])
    expect(entity.events[`yasu_ride:${e}`]).toBeDefined();
});
it("crafts from an SUV item, an iron block, and an iron shovel", () => {
  const r = read(`${BP}/recipes/yasu_ride/bulldozer_item.recipe.json`)[
    "minecraft:recipe_shapeless"
  ];
  expect(r.ingredients).toEqual(
    ["yasu_ride:suv_item", "minecraft:iron_block", "minecraft:iron_shovel"].map(
      (item) => ({ item }),
    ),
  );
  expect(r.tags).toEqual(["crafting_table"]);
  expect(r.unlock).toEqual({ context: "AlwaysUnlocked" });
  expect(r.result).toEqual({ item: "yasu_ride:bulldozer_item", count: 1 });
  const item = read(`${BP}/items/yasu_ride/bulldozer_item.item.json`)[
    "minecraft:item"
  ];
  expect(item.components["minecraft:display_name"]).toEqual({
    value: "item.yasu_ride:bulldozer_item.name",
  });
  const icon = item.components["minecraft:icon"];
  const texture = read(`${RP}/textures/item_texture.json`).texture_data[icon]
    .textures;
  expect(existsSync(`${RP}/${texture}.png`)).toBe(true);
});
it("names the bulldozer and its item in every locale", () => {
  for (const lang of readdirSync(`${RP}/texts`).filter((n) =>
    n.endsWith(".lang"),
  )) {
    const text = readFileSync(`${RP}/texts/${lang}`, "utf8");
    expect(text).toContain("entity.yasu_ride:bulldozer.name=");
    expect(text).toContain("item.yasu_ride:bulldozer_item.name=");
  }
});
it("runs the tracks, the door, and the blade rig from their properties", () => {
  const bones: Record<string, unknown> = {};
  for (const s of ["r", "l"]) {
    for (let n = 0; n < 3; n++)
      bones[`track_${s}_${n}`] = {
        scale: `query.property('yasu_ride:track_${s}') == ${n} ? 1 : 0`,
      };
    for (const wheel of ["idler_front", "idler_rear", "sprocket"])
      bones[`${wheel}_${s}`] = {
        rotation: [`query.property('yasu_ride:spin_${s}')`, 0, 0],
      };
  }
  bones.door_l = { rotation: [0, "query.property('yasu_ride:door') * -70", 0] };
  bones.blade_rig = {
    position: [
      0,
      "query.property('yasu_ride:blade') * 3",
      "query.property('yasu_ride:blade') * 3",
    ],
  };
  for (const side of ["r", "l"])
    bones[`lift_cylinder_${side}`] = {
      rotation: ["-query.property('yasu_ride:blade') * 10.12", 0, 0],
    };
  for (const side of ["r", "l"])
    bones[`lift_rod_${side}`] = {
      scale: [1, 1, "1 - query.property('yasu_ride:blade') * 2.73 / 7"],
    };
  expect(anim["animation.yasu_ride.bulldozer.drive"].bones).toEqual(bones);
  const names = read(`${RP}/models/entity/yasu_ride/bulldozer.geo.json`)[
    "minecraft:geometry"
  ][0].bones.map((b: { name: string }) => b.name);
  for (const a of Object.values(anim) as { bones?: Record<string, unknown> }[])
    for (const b of Object.keys(a.bones ?? {})) expect(names).toContain(b);
});
it("maps each paint and the cab monitor to its texture", () => {
  expect(Object.keys(client.textures)).toEqual([
    "default",
    ...PAINTS.slice(1),
    "monitor",
  ]);
  for (const t of Object.values(client.textures))
    expect(existsSync(`${RP}/${t}.png`)).toBe(true);
  expect(render.arrays.textures["Array.paints"]).toEqual(
    ["default", ...PAINTS.slice(1)].map((p) => `Texture.${p}`),
  );
});
it("glows from the thruster only in flight and shows the spinning propeller only under water", () => {
  expect(controller.initial_state).toBe("ground");
  expect(Object.keys(controller.states)).toEqual([
    "ground",
    "hover",
    "submarine",
  ]);
  expect(controller.states.ground.animations).toEqual(["propeller_stowed"]);
  expect(controller.states.hover.animations.slice(0, 2)).toEqual([
    "propeller_stowed",
    "hover_glow",
  ]);
  expect(controller.states.submarine.animations).toEqual([
    "propeller",
    { submarine_sound: "query.has_rider" },
  ]);
  const form = (...forms: string[]) =>
    forms.map((f) => `query.property('yasu_ride:form') == '${f}'`).join(" || ");
  const flying = form("takeoff", "hover", "landing");
  expect(controller.states.ground.transitions).toEqual([
    { hover: flying },
    { submarine: form("submarine") },
  ]);
  expect(controller.states.hover.transitions).toEqual([
    { ground: form("car") },
  ]);
  expect(controller.states.submarine.transitions).toEqual([
    { ground: form("car") },
    { hover: flying },
  ]);
  expect(JSON.stringify(controller)).not.toContain("gear_down");
  expect(client.particle_effects).toEqual({
    hover_glow: "yasu_ride:hover_glow",
  });
  expect(
    anim["animation.yasu_ride.bulldozer.hover_glow"].particle_effects["0.0"],
  ).toEqual([{ effect: "hover_glow", locator: "thruster" }]);
  expect(
    anim["animation.yasu_ride.bulldozer.propeller"].bones.propeller,
  ).toEqual({ scale: 1, rotation: [0, 0, "query.life_time * 720"] });
  expect(
    anim["animation.yasu_ride.bulldozer.propeller_stowed"].bones.propeller
      .scale,
  ).toBe(0);
  expect(
    readdirSync(RP, { recursive: true }).some((n) =>
      String(n).includes("thruster_glow"),
    ),
  ).toBe(false);
});
it("rumbles the engine at levels rescaled to a 9 blocks/s top speed", () => {
  const guard = "query.has_rider && query.property('yasu_ride:form') == 'car'";
  const entriesFor = (prefix: string): Record<string, string>[] =>
    client.scripts.animate.filter(
      (e: unknown) =>
        typeof e === "object" &&
        e !== null &&
        Object.keys(e)[0]?.startsWith(prefix),
    );
  const entries = entriesFor("engine_sound_");
  const engine = speedRanges(entries, "engine_sound_", guard);
  expect(engine).toEqual([
    [0, 0.5],
    [0.5, 2.25],
    [2.25, 4],
    [4, 5.75],
    [5.75, 7.5],
    [7.5, Infinity],
  ]);
  expectContiguous(engine);
  expect(entries[0]?.engine_sound_0).not.toContain("yasu_ride:blade");
  for (const entry of entries.slice(1))
    expect(Object.values(entry)[0]).toMatch(
      /^query.has_rider && query.property\('yasu_ride:form'\) == 'car' && query.property\('yasu_ride:blade'\) >= 0.05 && /,
    );
  for (const family of ["push", "track"]) {
    const prefix = `${family}_sound_`;
    const familyGuard =
      guard +
      (family === "push" ? " && query.property('yasu_ride:blade') < 0.05" : "");
    // speedRanges numbers levels from zero, but these start at 1 (the animate order below
    // checks the real keys), so rename them before comparing with the five moving levels.
    expect(
      speedRanges(
        entriesFor(prefix).map((entry, i) => ({
          [`${prefix}${i}`]: Object.values(entry)[0] ?? "",
        })),
        prefix,
        familyGuard,
      ),
    ).toEqual(engine.slice(1));
  }
  expect(
    client.scripts.animate.map((entry: string | Record<string, string>) =>
      typeof entry === "string" ? entry : Object.keys(entry)[0],
    ),
  ).toEqual([
    "form",
    "drive",
    "hydraulics",
    ...[0, 1, 2, 3, 4, 5].map((n) => `engine_sound_${n}`),
    ...[1, 2, 3, 4, 5].map((n) => `push_sound_${n}`),
    ...[1, 2, 3, 4, 5].map((n) => `track_sound_${n}`),
  ]);
  const hover = speedRanges(
    controller.states.hover.animations.slice(2),
    "hover_sound_",
    "",
  );
  expect(hover).toEqual([
    [0, 1],
    [1, 3],
    [3, 5],
    [5, 7],
    [7, Infinity],
  ]);
  expectContiguous(hover);
  const defs = read(`${RP}/sounds/sound_definitions.json`).sound_definitions;
  for (const effect of Object.values(client.sound_effects) as string[])
    expect(defs[effect]).toBeDefined();
});
it("lights the lamps and the beacon, and draws the glass blended", () => {
  for (const b of ["headlights", "beacon"])
    expect(render.materials).toContainEqual({
      [b]: "Array.lamps[query.property('yasu_ride:headlights') ? 1 : 0]",
    });
  for (const b of ["glass", "door_glass"])
    expect(render.materials).toContainEqual({ [b]: "Material.glass" });
  expect(client.materials).toEqual({
    default: "entity",
    glass: "entity_alphablend",
    lamp: "entity",
    lamp_lit: "entity_emissive",
  });
});

const soundDefs = read(`${RP}/sounds/sound_definitions.json`).sound_definitions;
it("maps bulldozer sounds to dedicated clips while preserving hover and sonar", () => {
  const expected: Record<string, string> = {
    hydraulics: "yasu_ride.bulldozer_hydraulics",
    sonar: "yasu_ride.sonar",
  };
  for (const family of ["engine", "push", "track"]) {
    for (let level = family === "engine" ? 0 : 1; level <= 5; level++)
      expected[`${family}_${level}`] = `yasu_ride.bulldozer_${family}_${level}`;
  }
  for (let level = 0; level < 5; level++)
    expected[`hover_${level}`] = `yasu_ride.hover_${level}`;
  expect(client.sound_effects).toEqual(expected);
  for (const event of Object.values(expected)) {
    expect(soundDefs[event], event).toBeDefined();
    for (const sound of soundDefs[event].sounds)
      expect(existsSync(`${RP}/${sound.name}.wav`), sound.name).toBe(true);
  }
});
it("matches sound animation lengths to their clips", () => {
  for (const [short, id] of Object.entries<string>(client.animations)) {
    const animation = anim[id];
    if (!animation?.sound_effects) continue;
    for (const { effect } of Object.values<{ effect: string }>(
      animation.sound_effects,
    )) {
      const sound = soundDefs[client.sound_effects[effect]].sounds[0];
      const wav = readFileSync(`${RP}/${sound.name}.wav`);
      expect(animation.animation_length, short).toBe(
        wav.readUInt32LE(40) / wav.readUInt32LE(28),
      );
      expect(animation.loop, short).toBe(short !== "hydraulics_sound");
    }
  }
  for (const family of ["engine", "push", "track"]) {
    for (let level = family === "engine" ? 0 : 1; level <= 5; level++) {
      const short = `${family}_sound_${level}`;
      expect(client.animations[short]).toBe(
        `animation.yasu_ride.bulldozer.${short}`,
      );
      expect(anim[client.animations[short]]).toEqual({
        loop: true,
        animation_length: family === "track" ? 1 : 4,
        sound_effects: { "0.0": { effect: `${family}_${level}` } },
      });
    }
  }
  expect(client.animations.hydraulics_sound).toBe(
    "animation.yasu_ride.bulldozer.hydraulics_sound",
  );
  // The clip covers the blade's travel and then its stop clunk and relief hiss.
  const hydraulics = anim[client.animations.hydraulics_sound];
  expect(hydraulics).toEqual({
    loop: false,
    animation_length: 0.9,
    sound_effects: { "0.0": { effect: "hydraulics" } },
  });
  expect(hydraulics.animation_length).toBeGreaterThan(
    BULLDOZER_SPEC.bladeLiftTicks / 20,
  );
});
it("increases volumes by speed and makes pushing louder than travel", () => {
  const volumes = {
    engine: [0.5, 0.54, 0.58, 0.62, 0.66, 0.7],
    push: [0.6, 0.65, 0.7, 0.75, 0.8],
    track: [0.25, 0.3, 0.35, 0.4, 0.45],
  };
  for (const [family, values] of Object.entries(volumes)) {
    const actual = values.map((_, i) => {
      const level = i + (family === "engine" ? 0 : 1);
      const def = soundDefs[`yasu_ride.bulldozer_${family}_${level}`];
      expect(def).toMatchObject({
        category: "neutral",
        min_distance: 4,
        max_distance: family === "track" ? 24 : 32,
      });
      return def.sounds[0].volume;
    });
    expect(actual).toEqual(values);
    for (let i = 1; i < actual.length; i++)
      expect(actual[i]).toBeGreaterThan(actual[i - 1]);
  }
  for (let level = 1; level <= 5; level++)
    expect(
      soundDefs[`yasu_ride.bulldozer_push_${level}`].sounds[0].volume,
    ).toBeGreaterThan(
      soundDefs[`yasu_ride.bulldozer_engine_${level}`].sounds[0].volume,
    );
  expect(soundDefs["yasu_ride.bulldozer_hydraulics"]).toEqual({
    category: "neutral",
    min_distance: 2,
    max_distance: 16,
    sounds: [{ name: "sounds/yasu_ride/bulldozer_hydraulics", volume: 0.35 }],
  });
});
it("plays hydraulics once when the blade leaves an endpoint", () => {
  expect(client.animations.hydraulics).toBe(
    "controller.animation.yasu_ride.bulldozer.hydraulics",
  );
  const controllers = read(
    `${RP}/animation_controllers/yasu_ride/bulldozer.ac.json`,
  ).animation_controllers;
  expect(controllers[client.animations.hydraulics]).toEqual({
    initial_state: "rest",
    states: {
      rest: {
        transitions: [
          {
            moving:
              "query.property('yasu_ride:blade') >= 0.05 && query.property('yasu_ride:blade') <= 0.95",
          },
        ],
      },
      moving: {
        animations: ["hydraulics_sound"],
        transitions: [
          {
            rest: "query.property('yasu_ride:blade') < 0.05 || query.property('yasu_ride:blade') > 0.95",
          },
        ],
      },
    },
  });
});
