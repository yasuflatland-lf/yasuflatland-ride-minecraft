import { readdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DECOR_MESSAGES } from "../../src/domain/vehicle/dock/decorMessages";
import { SLEEP_MESSAGES } from "../../src/domain/vehicle/dock/sleep";
import { HINTS } from "../../src/domain/vehicle/hints";
import { CAMPER_FURNITURE } from "../../src/domain/vehicle/kinds/camper/furniture";
import { CAMPER_PROFILE } from "../../src/domain/vehicle/kinds/camper/profile";
import { PAINTS } from "../../src/domain/vehicle/paint/paint";
import { CAMPER_DOOR_COMPONENT } from "../../src/infrastructure/vehicle/bedrock/identifiers";

const RP = "packs/yasu_ride_rp";
const geometryText = readFileSync(
  `${RP}/models/entity/yasu_ride/camper.geo.json`,
  "utf8",
);
interface Cube {
  origin: number[];
  size: number[];
  pivot?: number[];
  rotation?: number[];
  uv: Record<string, { uv: number[] }>;
}
interface Bone {
  name: string;
  parent?: string;
  pivot: number[];
  rotation?: number[];
  cubes?: Cube[];
  locators?: Record<string, number[]>;
}
const geometry = JSON.parse(geometryText)["minecraft:geometry"][0];
const bones: Bone[] = geometry.bones;
const bone = (name: string) => {
  const found = bones.find((b) => b.name === name);
  expect(found, name).toBeDefined();
  return found as Bone;
};

// The generator writes unfiltered 8-bit RGBA rows, as the preview generator does for icons.
function readPng(path: string) {
  const png = readFileSync(`${RP}/${path}.png`);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const pixels = Buffer.concat(
    Array.from({ length: height }, (_, y) => {
      const start = y * (stride + 1);
      expect(raw[start]).toBe(0);
      return raw.subarray(start + 1, start + 1 + stride);
    }),
  );
  return { width, height, pixels };
}

describe("camper model assets (ADR 0067)", () => {
  it("uses the production geometry identifier with no test namespace", () => {
    expect(geometry.description.identifier).toBe("geometry.yasu_ride.camper");
    expect(geometryText).not.toContain("yasu_ride_test");
  });

  it("connects every standard bone to root without cycles", () => {
    expect(bones.map((b) => b.name).sort()).toEqual(
      [
        "root",
        "body",
        "headlights",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr",
        "seat_0",
        "seat_1",
        "seat_2",
        "seat_3",
        "door_entry",
        "steering",
        "shower_door",
        "glass",
        "door_glass",
      ].sort(),
    );
    expect(bone("root").parent).toBeUndefined();
    expect(bone("body").parent).toBe("root");
    for (const b of bones.filter((b) => b.name !== "root")) {
      const visited = new Set<string>();
      let current = b;
      while (current.name !== "root") {
        expect(visited.has(current.name), b.name).toBe(false);
        visited.add(current.name);
        current = bone(current.parent ?? "");
      }
      if (b.name === "door_glass") expect(b.parent).toBe("door_entry");
      else if (b.name !== "body") expect(b.parent).toBe("body");
    }
  });

  it("puts wheel pivots at the axle centers and hover locators directly below after mirroring", () => {
    const locators = bone("body").locators;
    expect(Object.keys(locators ?? {}).sort()).toEqual(
      [
        "hover_fl",
        "hover_fr",
        "hover_rl",
        "hover_rr",
        "exhaust",
        "shower_head",
      ].sort(),
    );
    expect(locators?.exhaust).toEqual([12, 4, 52]);
    expect(locators?.shower_head).toEqual([-20.5, 44.5, 53.75]);
    for (const [name, x, z] of [
      ["fl", 21.4, -31.5],
      ["fr", -21.4, -31.5],
      ["rl", 21.4, 31],
      ["rr", -21.4, 31],
    ] as const) {
      const wheel = bone(`wheel_${name}`);
      expect(wheel.pivot).toEqual([x, 7.8, z]);
      expect(locators?.[`hover_${name}`]).toEqual([x, 0, z]);
      expect(wheel.cubes).toHaveLength(64);
      expect(new Set(wheel.cubes?.map((c) => c.uv.north?.uv[0])).size).toBe(4);
      for (const cube of wheel.cubes ?? []) {
        expect(cube.pivot?.[1]).toBe(7.8);
        expect(cube.rotation).toBeDefined();
      }
    }
    expect(bone("door_entry").pivot).toEqual([-24, 0, -7]);
  });

  it("keeps every rotated wheel cube above ground with the tires touching it", () => {
    for (const name of WHEELS) {
      const heights = (bone(name).cubes ?? []).flatMap((cube) => {
        const angle = ((cube.rotation?.[0] ?? 0) * Math.PI) / 180;
        const py = cube.pivot?.[1] ?? 0;
        const pz = cube.pivot?.[2] ?? 0;
        return Array.from({ length: 8 }, (_, corner) => {
          const y =
            (cube.origin[1] ?? 0) + ((corner >> 1) & 1) * (cube.size[1] ?? 0);
          const z =
            (cube.origin[2] ?? 0) + ((corner >> 2) & 1) * (cube.size[2] ?? 0);
          return py + (y - py) * Math.cos(angle) - (z - pz) * Math.sin(angle);
        });
      });
      // Geometry coordinates are rounded to three decimal places by the generator.
      expect(
        heights.every((y) => y >= -0.0005),
        name,
      ).toBe(true);
      expect(Math.min(...heights), name).toBeCloseTo(0, 3);
      expect(Math.max(...heights), name).toBeCloseTo(15.6, 3);
    }
  });

  it("clears furniture and wall lining from all four wheel housings", () => {
    const interior = bones.filter(
      (b) => b.name === "body" || b.name.startsWith("seat_"),
    );
    for (const [x0, x1] of [
      [18.3, 23],
      [-23, -18.3],
    ]) {
      for (const axle of [-31.5, 31]) {
        const low = [x0, -99, axle - 10.3 - 0.3];
        const high = [x1, 18.4, axle + 10.3 + 0.3];
        for (const b of interior) {
          for (const cube of b.cubes ?? []) {
            // Palette slots 7 and 21 are the black and wood panels enclosing the well.
            if ([7, 21].includes(cube.uv.north?.uv[0] ?? -1)) continue;
            const overlaps = cube.origin.every(
              (start, axis) =>
                start < (high[axis] ?? 0) - 0.001 &&
                start + (cube.size[axis] ?? 0) > (low[axis] ?? 0) + 0.001,
            );
            expect(overlaps, `${b.name}: ${cube.origin}`).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the facing dinette on the left behind the passenger, clear of the bed and side walls", () => {
    for (const name of ["seat_0", "seat_1", "headlights"]) {
      expect(bone(name).cubes?.length).toBeGreaterThan(0);
    }
    expect(bone("seat_0").cubes?.every((c) => (c.origin[0] ?? 0) < 0)).toBe(
      true,
    );
    expect(bone("seat_1").cubes?.every((c) => (c.origin[0] ?? 0) > 0)).toBe(
      true,
    );
    for (const [name, z0, z1] of [
      ["seat_2", -24, -10],
      ["seat_3", 10, 24],
    ] as const) {
      const cubes = bone(name).cubes ?? [];
      expect(cubes.length).toBeGreaterThan(0);
      expect(Math.min(...cubes.map((c) => c.origin[0] ?? 0))).toBe(8);
      expect(
        Math.max(...cubes.map((c) => (c.origin[0] ?? 0) + (c.size[0] ?? 0))),
      ).toBeCloseTo(23, 3);
      expect(Math.min(...cubes.map((c) => c.origin[2] ?? 0))).toBe(z0);
      expect(
        Math.max(...cubes.map((c) => (c.origin[2] ?? 0) + (c.size[2] ?? 0))),
      ).toBeCloseTo(z1, 3);
      for (const c of cubes) {
        expect(c.origin[1]).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("puts the steering wheel and column on the right in front of the driver", () => {
    const steering = bone("steering");
    expect(steering.pivot).toEqual([-12, 33, -41]);
    expect(steering.cubes?.length).toBeGreaterThan(0);
    for (const cube of steering.cubes ?? []) {
      expect((cube.origin[0] ?? 0) + (cube.size[0] ?? 0) / 2).toBeLessThan(0);
    }
  });

  // The wheel's cubes are built in its own plane and only moved by the pivot, so x and y
  // relative to the pivot are the wheel's own axes.
  it("keeps the steering wheel inside its rim (sightline)", () => {
    const steering = bone("steering");
    for (const cube of steering.cubes ?? []) {
      const fromPivot = (axis: number) =>
        (cube.origin[axis] ?? 0) +
        (cube.size[axis] ?? 0) / 2 -
        (steering.pivot[axis] ?? 0);
      expect(Math.hypot(fromPivot(0), fromPivot(1))).toBeLessThanOrEqual(
        7.2 + 0.5,
      );
    }
  });

  it("keeps the wheel's spokes level (owner decision in #410)", () => {
    const palette = readFileSync("tools/gen_camper.py", "utf8").match(
      /^PALETTE = \{\n([\s\S]*?)^\}/m,
    )?.[1];
    const slots = [...(palette ?? "").matchAll(/^\s+"(\w+)":/gm)].map(
      (m) => m[1],
    );
    const ivory = slots.indexOf("ivory");
    expect(ivory).toBeGreaterThanOrEqual(0);
    const spokes = (bone("steering").cubes ?? []).filter(
      (cube) => cube.uv.north?.uv[0] === ivory && Math.max(...cube.size) >= 3,
    );
    expect(spokes.length).toBeGreaterThan(0);
    for (const cube of spokes) {
      const z = cube.rotation?.[2] ?? 0;
      expect([0, 180, -180]).toContain(z);
      expect(cube.rotation?.[0] ?? 0).toBe(0);
      expect(cube.rotation?.[1] ?? 0).toBe(0);
    }
  });

  const near = (a: number | undefined, b: number) =>
    Math.abs((a ?? Number.NaN) - b) < 1e-6;
  const extent = (cube: Cube, axis: number) => {
    const lo = cube.origin[axis] ?? 0;
    return [lo, lo + (cube.size[axis] ?? 0)] as const;
  };

  it("lays the dash-top air vent wholly on the dash pad (#414)", () => {
    const body = bone("body").cubes ?? [];
    const pads = body.filter(
      (cube) =>
        near(cube.origin[1], 27) && near(cube.size[1], 1.6) && !cube.rotation,
    );
    expect(pads).toHaveLength(1);
    const pad = pads[0] as Cube;
    const [padX0, padX1] = extent(pad, 0);
    const [, padTop] = extent(pad, 1);
    const [padZ0, padZ1] = extent(pad, 2);
    const vent = body.filter((cube) => {
      const [x0, x1] = extent(cube, 0);
      return near(cube.origin[1], padTop) && x0 > -15 && x1 < -9;
    });
    expect(vent.length).toBeGreaterThanOrEqual(3);
    for (const cube of vent) {
      // A cube turned about y reaches at most half its x-z diagonal from its middle.
      const reach = cube.rotation
        ? Math.hypot(cube.size[0] ?? 0, cube.size[2] ?? 0) / 2
        : (cube.size[2] ?? 0) / 2;
      const [z0, z1] = extent(cube, 2);
      const [x0, x1] = extent(cube, 0);
      expect(x0).toBeGreaterThanOrEqual(padX0);
      expect(x1).toBeLessThanOrEqual(padX1);
      expect((z0 + z1) / 2 - reach).toBeGreaterThanOrEqual(padZ0);
      expect((z0 + z1) / 2 + reach).toBeLessThanOrEqual(padZ1);
    }
  });

  it("keeps the console switches clear of the steering column and the door armrest (#414)", () => {
    const body = bone("body").cubes ?? [];
    const armrests = body.filter(
      (cube) =>
        near(cube.origin[1], 22) &&
        near(cube.size[1], 1.4) &&
        near(cube.size[2], 8) &&
        (cube.origin[0] ?? 0) < 0,
    );
    expect(armrests).toHaveLength(1);
    const armrest = armrests[0] as Cube;
    const steering = bone("steering");
    const column = (steering.cubes ?? []).find((cube) =>
      near(cube.size[2], 15.4),
    );
    expect(column).toBeDefined();
    const lean = ((steering.rotation?.[0] ?? 0) * Math.PI) / 180;
    // Undo the wheel bone's lean about x to test a point against the column cube.
    const inColumn = ([x, y, z]: number[]) => {
      const [, py, pz] = steering.pivot as [number, number, number];
      const dy = (y ?? 0) - py;
      const dz = (z ?? 0) - pz;
      const local = [
        x ?? 0,
        py + dy * Math.cos(lean) - dz * Math.sin(lean),
        pz + dy * Math.sin(lean) + dz * Math.cos(lean),
      ];
      return local.every((v, axis) => {
        const [lo, hi] = extent(column as Cube, axis);
        return v > lo && v < hi;
      });
    };
    const overlaps = (a: Cube, b: Cube) =>
      [0, 1, 2].every((axis) => {
        const [a0, a1] = extent(a, axis);
        const [b0, b1] = extent(b, axis);
        return a0 < b1 && b0 < a1;
      });
    // The switches, lamps, and levers stand on the black panel's face, 0.2 to 0.6 px off the dash.
    const switches = body.filter((cube) => {
      const [x0, x1] = extent(cube, 0);
      const [z0, z1] = extent(cube, 2);
      return (
        x0 > -22.5 &&
        x1 < -9 &&
        z0 > -47.62 &&
        z1 < -47.2 &&
        Math.max(cube.size[0] ?? 0, cube.size[1] ?? 0) < 2.5
      );
    });
    expect(switches.length).toBeGreaterThan(20);
    for (const cube of switches) {
      expect(overlaps(cube, armrest), JSON.stringify(cube.origin)).toBe(false);
      const [x0, x1] = extent(cube, 0);
      const [y0, y1] = extent(cube, 1);
      const [z0, z1] = extent(cube, 2);
      for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 6; j++)
          for (let k = 0; k <= 2; k++) {
            const point = [
              x0 + ((x1 - x0) * i) / 6,
              y0 + ((y1 - y0) * j) / 6,
              z0 + ((z1 - z0) * k) / 2,
            ];
            expect(inColumn(point), JSON.stringify(cube.origin)).toBe(false);
          }
    }
  });

  it("generates all 16 equally sized paints, changing only the three accent swatches", () => {
    const files = readdirSync(`${RP}/textures/entity/yasu_ride`).filter(
      (name) => /^camper(?:_\w+)?\.png$/.test(name),
    );
    expect(files).toHaveLength(PAINTS.length);
    const khaki = readPng("textures/entity/yasu_ride/camper");
    expect([khaki.width, khaki.height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    for (const paint of PAINTS.slice(1)) {
      const texture = readPng(`textures/entity/yasu_ride/camper_${paint}`);
      expect([texture.width, texture.height]).toEqual([
        khaki.width,
        khaki.height,
      ]);
      expect(texture.pixels.equals(khaki.pixels), paint).toBe(false);
      for (let i = 0; i < khaki.width; i++) {
        // The PALETTE order in tools/gen_camper.py puts tan, khaki, and stripe
        // in slots 3, 4, and 6.
        if ([3, 4, 6].includes(i)) continue;
        expect(texture.pixels.subarray(i * 4, i * 4 + 4), paint).toEqual(
          khaki.pixels.subarray(i * 4, i * 4 + 4),
        );
      }
    }
  });

  it("generates a 16 by 16 RGBA item icon with transparency", () => {
    const icon = readPng("textures/items/yasu_ride/camper_item");
    expect([icon.width, icon.height]).toEqual([16, 16]);
    expect(icon.pixels.subarray(0, 16 * 4)).toEqual(Buffer.alloc(16 * 4));
    expect(icon.pixels.subarray((3 * 16 + 2) * 4, (3 * 16 + 3) * 4)).toEqual(
      Buffer.from([238, 235, 226, 255]),
    );
  });

  it("generates a 16 by 16 RGBA camping gear box icon with transparency", () => {
    const icon = readPng("textures/items/yasu_ride/camping_gear_box");
    expect([icon.width, icon.height]).toEqual([16, 16]);
    expect(icon.pixels.subarray(0, 16 * 4)).toEqual(Buffer.alloc(16 * 4));
    expect(icon.pixels.subarray((3 * 16 + 2) * 4, (3 * 16 + 3) * 4)).toEqual(
      Buffer.from([222, 184, 135, 255]),
    );
    expect(icon.pixels.subarray((9 * 16 + 8) * 4, (9 * 16 + 9) * 4)).toEqual(
      Buffer.from([204, 85, 0, 255]),
    );
  });
});

const camperEntity = JSON.parse(
  readFileSync("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json", "utf8"),
)["minecraft:entity"];
it("matches the camper's four seat positions and collision box to its profile", () => {
  const components = camperEntity.components;
  const seats = components["minecraft:rideable"].seats;
  expect(seats).toHaveLength(4);
  expect(
    seats.map((seat: { position: number[] }) => ({
      x: seat.position[0],
      z: seat.position[2],
    })),
  ).toEqual(CAMPER_PROFILE.seats.positions);
  expect(
    camperEntity.component_groups["yasu_ride:undocked"][
      "minecraft:collision_box"
    ],
  ).toEqual({
    width: 3,
    height: 4,
  });
});

const camperRender = JSON.parse(
  readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
).render_controllers["controller.render.yasu_ride.camper"];
const camperMaterials: Record<string, string> = JSON.parse(
  readFileSync(`${RP}/entity/yasu_ride/camper.ce.json`, "utf8"),
)["minecraft:client_entity"].description.materials;

describe("camper glass (ADR 0091)", () => {
  const glassBones = ["glass", "door_glass"];
  // The PALETTE order in tools/gen_camper.py puts glass in slot 13.
  const glassSlot = 13;
  const slotOf = (cube: Cube) => cube.uv.north?.uv[0];

  it("draws the model opaque and blends only the glass material", () => {
    expect(camperMaterials).toEqual({
      default: "entity",
      lamp: "entity",
      lamp_lit: "entity_emissive",
      glass: "entity_alphablend",
    });
    const entries: Record<string, string>[] = camperRender.materials;
    expect(entries[0]).toEqual({ "*": "Material.default" });
    const glassEntries = entries.filter((entry) =>
      Object.values(entry).includes("Material.glass"),
    );
    expect(glassEntries).toEqual(
      glassBones.map((name) => ({ [name]: "Material.glass" })),
    );
  });

  it("keeps the glass swatch see-through and every other swatch opaque in every paint", () => {
    for (const paint of PAINTS) {
      const name = paint === PAINTS[0] ? "camper" : `camper_${paint}`;
      const { width, pixels } = readPng(`textures/entity/yasu_ride/${name}`);
      for (let i = 0; i < width; i++) {
        const alpha = pixels[i * 4 + 3];
        if (i === glassSlot) expect(alpha, paint).toBeLessThan(255);
        else expect(alpha, `${paint} slot ${i}`).toBe(255);
      }
    }
  });

  it("puts every glass cube in a glass bone listed after every opaque bone", () => {
    for (const b of bones) {
      const glassy = (b.cubes ?? []).filter((c) => slotOf(c) === glassSlot);
      if (glassBones.includes(b.name)) {
        expect(b.cubes?.length, b.name).toBeGreaterThan(0);
        expect(glassy).toHaveLength(b.cubes?.length ?? 0);
      } else {
        expect(glassy, b.name).toHaveLength(0);
      }
    }
    expect(bones.slice(-glassBones.length).map((b) => b.name)).toEqual(
      glassBones,
    );
    expect(bone("door_glass").pivot).toEqual(bone("door_entry").pivot);
  });
});

it("lists every paint in the camper render controller", () => {
  const controller = JSON.parse(
    readFileSync(`${RP}/render_controllers/yasu_ride/camper.rc.json`, "utf8"),
  ).render_controllers["controller.render.yasu_ride.camper"];
  expect(controller.arrays.textures["Array.paints"]).toHaveLength(
    PAINTS.length,
  );
});

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
    expect(Object.keys(camperClient.animations)).toHaveLength(27);
    for (const name of Object.values(camperClient.animations)) {
      expect(names.has(String(name)), String(name)).toBe(true);
    }
  });

  it("animates only root, the wheels, the entry door, and the shower door present in the model", () => {
    const allowed = [
      "root",
      "wheel_fl",
      "wheel_fr",
      "wheel_rl",
      "wheel_rr",
      "door_entry",
      "shower_door",
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

describe("camper parking assets (ADR 0068)", () => {
  it("keeps the 3 x 4 collision box in the base components", () => {
    // Taps never reach custom_hit_test without a base collision box (ADR 0068).
    expect(camperEntity.components["minecraft:collision_box"]).toEqual({
      width: 3,
      height: 4,
    });
  });

  it("switches collision and gravity groups when parking and departing", () => {
    expect(camperEntity.component_groups["yasu_ride:undocked"]).toEqual({
      "minecraft:collision_box": { width: 3, height: 4 },
    });
    expect(camperEntity.component_groups["yasu_ride:docked"]).toEqual({
      "minecraft:physics": { has_collision: false, has_gravity: false },
      "minecraft:collision_box": { width: 0.4, height: 0.4 },
    });
    expect(camperEntity.events["minecraft:entity_spawned"]).toEqual({
      add: { component_groups: ["yasu_ride:undocked"] },
    });
    expect(camperEntity.events["yasu_ride:dock"]).toEqual({
      remove: {
        component_groups: ["yasu_ride:weighted", "yasu_ride:undocked"],
      },
      add: { component_groups: ["yasu_ride:docked"] },
    });
    expect(camperEntity.events["yasu_ride:undock"]).toEqual({
      remove: { component_groups: ["yasu_ride:docked"] },
      add: { component_groups: ["yasu_ride:weighted", "yasu_ride:undocked"] },
    });
  });

  it("registers the door component and rotates only the model's entry door", () => {
    const door = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/blocks/yasu_ride/camper_door.block.json",
        "utf8",
      ),
    )["minecraft:block"];
    expect(door.components["minecraft:custom_components"]).toEqual([
      CAMPER_DOOR_COMPONENT,
    ]);
    expect(camperClient.animations.door).toBe(
      "animation.yasu_ride.camper.door",
    );
    expect(camperClient.scripts.animate).toContain("door");
    const animation = camperAnimations["animation.yasu_ride.camper.door"];
    expect(animation?.loop).toBe(true);
    expect(animation?.bones).toEqual({
      door_entry: { rotation: [0, "q.property('yasu_ride:door') * -100", 0] },
    });
    expect(bones.map((b) => b.name)).toContain("door_entry");
  });

  it.each(["en_US", "ja_JP"])(
    "translates parking and cargo messages in %s",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of ["cannot_park", "clear_cargo"])
        expect(lang).toMatch(
          new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
        );
    },
  );

  it.each(["en_US", "ja_JP"])("translates the bed message in %s", (locale) => {
    const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
    for (const name of Object.values(SLEEP_MESSAGES))
      expect(lang).toMatch(
        new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
      );
  });

  it.each(["en_US", "ja_JP"])(
    "translates the decor message in %s",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of Object.values(DECOR_MESSAGES))
        expect(lang).toMatch(
          new RegExp(`^yasu_ride\\.message\\.${name}=.+$`, "m"),
        );
    },
  );

  it.each(["en_US", "ja_JP"])(
    "translates every hint in %s, with the hit count and the vehicle name in the bumper hints and the vehicle name in the paint hint",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const name of Object.values(HINTS)) {
        const line = lang.match(
          new RegExp(`^yasu_ride\\.hint\\.${name}=(.+)$`, "m"),
        );
        expect(line, name).not.toBeNull();
        const args = line?.[1]?.match(/%s/g)?.length ?? 0;
        expect(args, name).toBe(
          name.startsWith("bumper_") ? 2 : name === HINTS.paint ? 1 : 0,
        );
      }
    },
  );
});

describe("camper furniture model (ADR 0093)", () => {
  // The ceiling plate's underside, 29 px above a layer-2 cell's bottom (ADR 0093).
  const PLATE_UNDERSIDE = 29;
  // A hanging decor item's top: the top of its cell, where the hook ends (ADR 0099).
  const HANG_TOP = 16;

  it("puts every standing decor slot on the model's top surface and runs the ceiling hook from the ceiling plate to the top of its cell (ADR 0093, 0099, 0102)", () => {
    const slots = CAMPER_FURNITURE.flatMap((f) => f.slots);
    expect(slots).toHaveLength(10);
    const unrotatedCubes = bones
      .filter((b) => b.rotation === undefined)
      .flatMap((b) => b.cubes ?? [])
      .filter((cube) => cube.rotation === undefined);
    for (const slot of slots) {
      const x = 16 * slot.cell.x;
      const z = -16 * slot.cell.z;
      const bottom = 16 * slot.cell.layer;
      const covering = unrotatedCubes.filter((cube) => {
        const [ox = 0, , oz = 0] = cube.origin;
        const [sx = 0, , sz = 0] = cube.size;
        return ox <= x && x <= ox + sx && oz <= z && z <= oz + sz;
      });
      if (slot.hanging !== true) {
        const tops = covering.flatMap((cube) => {
          const [, oy = 0] = cube.origin;
          const [, sy = 0] = cube.size;
          return oy < bottom + 16 && oy + sy > bottom ? [oy + sy] : [];
        });
        expect(tops.length, slot.id).toBeGreaterThan(0);
        expect(Math.ceil(Math.max(...tops) - bottom - 1e-9), slot.id).toBe(
          slot.height,
        );
      } else {
        const plate = covering.filter((cube) => {
          const [, oy = 0] = cube.origin;
          const [sx = 0, , sz = 0] = cube.size;
          return sx >= 16 && sz >= 16 && oy >= bottom;
        });
        expect(plate.length, slot.id).toBeGreaterThan(0);
        const underside = Math.min(
          ...plate.map((cube) => {
            const [, oy = 0] = cube.origin;
            return oy;
          }),
        );
        expect(Math.ceil(underside - bottom - 1e-9), slot.id).toBe(
          PLATE_UNDERSIDE,
        );
        const hook = covering.filter((cube) => {
          const [, oy = 0] = cube.origin;
          const [sx = 0, sy = 0] = cube.size;
          return sx < 16 && oy >= bottom && oy + sy <= underside + 1e-6;
        });
        expect(hook.length, slot.id).toBeGreaterThan(0);
        const cellTop = bottom + HANG_TOP;
        const spans = hook
          .map((cube) => {
            const [, oy = 0] = cube.origin;
            const [, sy = 0] = cube.size;
            return [oy, oy + sy] as const;
          })
          .sort((a, b) => a[0] - b[0]);
        for (const [lo] of spans) {
          expect(lo, slot.id).toBeGreaterThanOrEqual(cellTop - 1e-6);
        }
        expect(spans[0]?.[0], slot.id).toBeCloseTo(cellTop, 6);
        let reach = cellTop;
        for (const [lo, hi] of spans) {
          expect(lo, slot.id).toBeLessThanOrEqual(reach + 1e-6);
          reach = Math.max(reach, hi);
        }
        expect(reach, slot.id).toBeGreaterThanOrEqual(underside - 1e-6);
        expect(
          covering.some((cube) => {
            const [, oy = 0] = cube.origin;
            const [, sy = 0] = cube.size;
            return oy < cellTop - 0.001 && oy + sy > bottom + 0.001;
          }),
          slot.id,
        ).toBe(false);
      }
    }
  });

  it("raises the wall cabinet to the ceiling (ADR 0103)", () => {
    // The cell (-1, -1, 2) the cabinet's front half used to stand in, at its middle.
    const x = 16 * -1;
    const z = -16 * -1;
    const covering = (bones.find((b) => b.name === "body")?.cubes ?? [])
      .filter((cube) => cube.rotation === undefined)
      .filter((cube) => {
        const [ox = 0, , oz = 0] = cube.origin;
        const [sx = 0, , sz = 0] = cube.size;
        return ox <= x && x <= ox + sx && oz <= z && z <= oz + sz;
      })
      .map((cube) => {
        const [, oy = 0] = cube.origin;
        const [, sy = 0] = cube.size;
        return [oy, oy + sy] as const;
      });
    expect(covering).toContainEqual([54, 61]);
    expect(covering.some(([lo, hi]) => lo < 54 && hi > 32)).toBe(false);
  });

  it("keeps every body cube, rotated ones included, below the stove slot's top under the widest item's footprint (ADR 0100)", () => {
    // The widest decor item is 7 px across (the cushion) and the tallest 7 px high.
    const HALF_WIDTH = 3.5;
    const ITEM_HEIGHT = 7;
    const STEPS = 4;
    const turn = (point: number[], pivot: number[], rotation: number[]) => {
      let [x = 0, y = 0, z = 0] = point.map((v, i) => v - (pivot[i] ?? 0));
      // The game turns z the other way from right-handed math (mirror_x in tools/gen_camper.py).
      const [rx = 0, ry = 0, rz = 0] = rotation;
      for (const [axis, degrees] of [
        ["x", rx],
        ["y", ry],
        ["z", -rz],
      ] as const) {
        const s = Math.sin((degrees * Math.PI) / 180);
        const c = Math.cos((degrees * Math.PI) / 180);
        if (axis === "x") [y, z] = [y * c - z * s, y * s + z * c];
        else if (axis === "y") [x, z] = [x * c + z * s, -x * s + z * c];
        else [x, y] = [x * c - y * s, x * s + y * c];
      }
      return [x, y, z].map((v, i) => v + (pivot[i] ?? 0));
    };
    const points = (bone("body").cubes ?? []).flatMap((cube) => {
      const out: number[][] = [];
      for (let i = 0; i <= STEPS; i++)
        for (let j = 0; j <= STEPS; j++)
          for (let k = 0; k <= STEPS; k++) {
            const p = [i, j, k].map(
              (n, axis) =>
                (cube.origin[axis] ?? 0) + ((cube.size[axis] ?? 0) * n) / STEPS,
            );
            out.push(
              cube.rotation && cube.pivot
                ? turn(p, cube.pivot, cube.rotation)
                : p,
            );
          }
      return out;
    });
    // Only the stove is held to this so far: the sink rim rises 0.15 px into the counter's
    // footprint and the dashboard's slanted cubes into the dashboard's.
    const standing = CAMPER_FURNITURE.flatMap((f) => f.slots).filter(
      (slot) => slot.id === "stove",
    );
    expect(standing).toHaveLength(1);
    for (const slot of standing) {
      const x = 16 * slot.cell.x;
      const z = -16 * slot.cell.z;
      const top = 16 * slot.cell.layer + slot.height;
      const intruding = points.filter(
        ([px = 0, py = 0, pz = 0]) =>
          Math.abs(px - x) < HALF_WIDTH &&
          Math.abs(pz - z) < HALF_WIDTH &&
          py > top + 1e-6 &&
          py < top + ITEM_HEIGHT,
      );
      expect(intruding, slot.id).toEqual([]);
    }
  });

  it("keeps the aisle and the cell inside the entry door clear of the body's furniture", () => {
    for (const [low, high] of [
      [
        [-8, 16, -24],
        [8, 60.8, 55.5],
      ],
      [
        [-22.8, 16, -8],
        [-8, 60.8, 8],
      ],
    ] as const) {
      for (const cube of bone("body").cubes ?? []) {
        const overlaps = cube.origin.every(
          (start, axis) =>
            start < (high[axis] ?? 0) - 0.001 &&
            start + (cube.size[axis] ?? 0) > (low[axis] ?? 0) + 0.001,
        );
        expect(overlaps, `body: ${cube.origin}`).toBe(false);
      }
    }
  });

  it("hinges the closed shower-toilet door on its rear edge at the aisle", () => {
    const door = bone("shower_door");
    expect(door.pivot).toEqual([-8, 0, 54]);
    expect(door.parent).toBe("body");
    expect(door.rotation).toBeUndefined();
    expect(door.cubes?.length).toBeGreaterThan(0);
    for (const cube of door.cubes ?? []) {
      const [ox = 0, , oz = 0] = cube.origin;
      const [sx = 0, , sz = 0] = cube.size;
      expect(oz).toBeGreaterThanOrEqual(42);
      expect(oz + sz).toBeLessThanOrEqual(54);
      expect(ox).toBeGreaterThanOrEqual(-9.2 - 1e-6);
      expect(ox + sx).toBeLessThanOrEqual(-7.4 + 1e-6);
    }
  });
});
