import { readdirSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
type ModelCube = NonNullable<Bone["cubes"]>[number] & {
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
};
type ModelBone = Omit<Bone, "cubes"> & {
  cubes?: ModelCube[];
  locators?: Record<string, number[]>;
};
const geometryText = () =>
  readFileSync(`${RP}/models/entity/yasu_ride/bulldozer.geo.json`, "utf8");
const geometry = () => JSON.parse(geometryText())["minecraft:geometry"][0];
const bones = (): ModelBone[] => geometry().bones;
const bone = (name: string): ModelBone => {
  const found = bones().find((b) => b.name === name);
  expect(found, name).toBeDefined();
  return found as ModelBone;
};
const points = (b: Bone) => (b.cubes ?? []).flatMap((c) => turnedCorners(b, c));
const textureDir = `${RP}/textures/entity/yasu_ride`;
const texturePath = (paint: string) =>
  `${textureDir}/bulldozer${paint === "khaki" ? "" : `_${paint}`}.png`;
const texture = (paint = "khaki") => readRgbaPng(texturePath(paint));
const swatch = (paint: string, slot: number) => [
  ...texture(paint).pixels.subarray(slot * 4, slot * 4 + 4),
];

function expectedParent(name: string): string | undefined {
  switch (name) {
    case "root":
      return undefined;
    case "body":
      return "root";
    case "blade":
      return "blade_rig";
    case "lift_rod_r":
      return "lift_cylinder_r";
    case "lift_rod_l":
      return "lift_cylinder_l";
    case "door_glass":
      return "door_l";
    default:
      return "body";
  }
}

const GLASS_SLOT = 31;
const LENS_SLOTS = [14, 16];

function expectedAlpha(slot: number): number {
  if (slot === GLASS_SLOT) return 96;
  if (LENS_SLOTS.includes(slot)) return 0;
  return 255;
}

describe("bulldozer model (ADR 0009, 0136)", () => {
  it("uses the production geometry identifier with no test namespace", () => {
    expect(geometry().description.identifier).toBe(
      "geometry.yasu_ride.bulldozer",
    );
    expect(geometryText()).not.toContain("yasu_ride_test");
    expect(geometry().description.texture_width).toBe(32);
    expect(geometry().description.texture_height).toBe(1);
  });
  it("has exactly the bone contract, each bone parented to body except root, body, blade, the lift rods, and door_glass", () => {
    expect(
      bones()
        .map((b) => b.name)
        .sort(),
    ).toEqual(
      [
        "root",
        "body",
        "blade_rig",
        "blade",
        "lift_cylinder_r",
        "lift_cylinder_l",
        "lift_rod_r",
        "lift_rod_l",
        "headlights",
        "beacon",
        "seat_0",
        "track_r_0",
        "track_r_1",
        "track_r_2",
        "track_l_0",
        "track_l_1",
        "track_l_2",
        "idler_front_r",
        "idler_rear_r",
        "sprocket_r",
        "idler_front_l",
        "idler_rear_l",
        "sprocket_l",
        "propeller",
        "door_l",
        "glass",
        "door_glass",
      ].sort(),
    );
    for (const b of bones()) {
      expect(b.parent).toBe(expectedParent(b.name));
      expect(b.rotation?.some((v) => v !== 0) ?? false).toBe(false);
    }
  });
  it("keeps the front at -z", () => {
    for (const side of ["r", "l"]) {
      expect(bone(`idler_front_${side}`).pivot?.[2]).toBeLessThan(
        bone(`sprocket_${side}`).pivot?.[2] as number,
      );
      expect(bone(`sprocket_${side}`).pivot?.[2]).toBeLessThan(
        bone(`idler_rear_${side}`).pivot?.[2] as number,
      );
    }
    expect(bone("blade").pivot?.[2]).toBeLessThan(0);
  });
  it("mirrors the left track phases and wheels from the right ones", () => {
    const normalized = (cubes: ModelCube[], mirror: boolean) =>
      cubes
        .map((c) => {
          const rounded = (values: number[] | undefined) =>
            values?.map((n) => Number(n.toFixed(3)) || 0);
          return JSON.stringify({
            origin: rounded(
              mirror
                ? [-(c.origin[0] + c.size[0]), c.origin[1], c.origin[2]]
                : c.origin,
            ),
            size: rounded(c.size),
            pivot: rounded(
              mirror && c.pivot
                ? [-c.pivot[0], c.pivot[1], c.pivot[2]]
                : c.pivot,
            ),
            rotation: rounded(
              mirror && c.rotation
                ? [c.rotation[0], -c.rotation[1], -c.rotation[2]]
                : c.rotation,
            ),
          });
        })
        .sort();
    for (const k of [0, 1, 2]) {
      const left = bone(`track_l_${k}`).cubes ?? [];
      const right = bone(`track_r_${k}`).cubes ?? [];
      expect(left).toHaveLength(87);
      expect(right).toHaveLength(87);
      expect(normalized(left, false)).toEqual(normalized(right, true));
    }
    for (const wheel of ["idler_front", "idler_rear", "sprocket"]) {
      const pivot = bone(`${wheel}_r`).pivot;
      if (!pivot) throw new Error(`Missing ${wheel}_r pivot`);
      expect(pivot[0]).toBeLessThan(0);
      expect(bone(`${wheel}_l`).pivot).toEqual([-pivot[0], pivot[1], pivot[2]]);
    }
  });
  it("hinges door_glass with door_l and puts the glass bones last", () => {
    expect(bone("door_glass").pivot).toEqual(bone("door_l").pivot);
    expect(
      bones()
        .slice(-2)
        .map((b) => b.name),
    ).toEqual(["glass", "door_glass"]);
    for (const b of bones())
      for (const c of b.cubes ?? []) {
        const slots = Object.values(c.uv).map((face) => face.uv[0]);
        if (slots.includes(GLASS_SLOT))
          expect(["glass", "door_glass"]).toContain(b.name);
        if (["glass", "door_glass"].includes(b.name))
          expect(slots.every((slot) => slot === GLASS_SLOT)).toBe(true);
      }
  });
  it("has a thruster locator on body", () => {
    expect(bone("body").locators?.thruster).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
  });
  it("seats the driver and lights from bones on body", () => {
    expect(bone("seat_0").pivot).toEqual([0, 28.6, 22.0]);
    expect(bone("headlights").parent).toBe("body");
    expect(bone("beacon").parent).toBe("body");
    expect(bone("headlights").cubes).toHaveLength(9);
    expect(bone("beacon").cubes).toHaveLength(1);
  });
  it("pins the blade front and the model reach that the profile is built from", () => {
    const front = Math.min(...points(bone("blade")).map((p) => p[2]));
    expect(front).toBeCloseTo(-38.4, 3);
    for (const b of bones().filter((b) => b.name !== "blade"))
      for (const p of points(b)) expect(p[2]).toBeGreaterThanOrEqual(front);
    expect(
      Math.min(...points(bone("headlights")).map((p) => p[2])),
    ).toBeCloseTo(-14.8, 3);
    const reach = Math.max(
      ...bones()
        .flatMap(points)
        .map(([x, , z]) => Math.hypot(x, z) / 16),
    );
    expect(reach).toBeCloseTo(3.335, 3);
    expect(reach).toBeLessThanOrEqual(3.35);
  });
});

describe("bulldozer paints (ADR 0031, 0076)", () => {
  it("generates one equally sized texture per paint", () => {
    expect(
      readdirSync(textureDir)
        .filter((f) => /^bulldozer(?:_\w+)?\.png$/.test(f))
        .sort(),
    ).toEqual(
      [
        "bulldozer.png",
        ...PAINTS.slice(1).map((p) => `bulldozer_${p}.png`),
      ].sort(),
    );
    for (const paint of PAINTS) {
      expect(texture(paint).width).toBe(32);
      expect(texture(paint).height).toBe(1);
    }
  });
  it("shows the approved yellow at variant 0 and in the yellow paint only", () => {
    expect([0, 1, 2, 3].map((slot) => swatch("khaki", slot))).toEqual([
      [236, 178, 22, 255],
      [204, 150, 14, 255],
      [168, 120, 10, 255],
      [246, 204, 70, 255],
    ]);
    expect(texture("yellow").pixels).toEqual(texture().pixels);
    expect(readFileSync(texturePath("yellow"))).toEqual(
      readFileSync(texturePath("khaki")),
    );
    for (const paint of PAINTS.slice(1).filter((p) => p !== "yellow"))
      expect(texture(paint).pixels).not.toEqual(texture().pixels);
  });
  it("changes only the yellow, yellow_dark, louver, and yellow_light swatches", () => {
    for (const paint of PAINTS)
      expect(texture(paint).pixels.subarray(16)).toEqual(
        texture().pixels.subarray(16),
      );
  });
  it("derives the dark, louver, and light shades from the paint's base", () => {
    expect([0, 1, 2, 3].map((slot) => swatch("red", slot))).toEqual([
      [128, 22, 26, 255],
      [110, 19, 22, 255],
      [91, 16, 18, 255],
      [160, 80, 83, 255],
    ]);
  });
  it("keeps glass see-through, lens and amber at alpha 0, and every other swatch opaque in every paint", () => {
    for (const paint of PAINTS)
      for (let slot = 0; slot < 32; slot++)
        expect(swatch(paint, slot)[3]).toBe(expectedAlpha(slot));
  });
});

describe("bulldozer item icon", () => {
  it("generates a 16 by 16 RGBA item icon on transparency, in the default yellow", () => {
    const { width, height, pixels } = readRgbaPng(
      `${RP}/textures/items/yasu_ride/bulldozer_item.png`,
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels.subarray(0, 64)).toEqual(Buffer.alloc(64));
    const colors = Array.from({ length: 256 }, (_, i) => [
      ...pixels.subarray(i * 4, i * 4 + 4),
    ]);
    expect(colors).toContainEqual([236, 178, 22, 255]);
    for (const color of colors)
      if ((color[3] ?? 0) > 0) expect(color[3]).toBe(255);
  });
});

describe("bulldozer blade rig (ADR 0138)", () => {
  type Point = [number, number, number];
  const lowest = (ps: Point[], axis: number) =>
    Math.min(...ps.map((p) => p[axis] ?? Number.NaN));
  const highest = (ps: Point[], axis: number) =>
    Math.max(...ps.map((p) => p[axis] ?? Number.NaN));
  const capture = (pattern: RegExp, text: string, what: string) => {
    const match = pattern.exec(text);
    if (!match) throw new Error(`Invalid ${what}: ${text}`);
    return match.slice(1).map(Number);
  };
  const drive = JSON.parse(
    readFileSync(`${RP}/animations/yasu_ride/bulldozer.anim.json`, "utf8"),
  ).animations["animation.yasu_ride.bulldozer.drive"].bones;
  const position = /^query\.property\('yasu_ride:blade'\) \* (\d+(?:\.\d+)?)$/;
  const swing = /^-query\.property\('yasu_ride:blade'\) \* (\d+(?:\.\d+)?)$/;
  const rodScale =
    /^1 - query\.property\('yasu_ride:blade'\) \* (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)$/;
  const [ky = Number.NaN] = capture(position, drive.blade_rig.position[1], "y");
  const [kz = Number.NaN] = capture(position, drive.blade_rig.position[2], "z");
  const raised = (rest: Point[], blade: number): Point[] =>
    rest.map(([x, y, z]) => [x, y + ky * blade, z + kz * blade]);
  // The rod's front end on its axis at rest, and where the drive animation puts it: the rod
  // scales along z about its pivot, then the cylinder turns about its rear pin, as the game
  // composes a child bone inside its parent. The geometry is read once per side, because the
  // property test below calls rodEnd.at hundreds of times.
  const rodEnd = (side: string) => {
    const [turn = Number.NaN] = capture(
      swing,
      drive[`lift_cylinder_${side}`].rotation[0],
      `lift_cylinder_${side} rotation`,
    );
    const [shorten = Number.NaN, length = Number.NaN] = capture(
      rodScale,
      drive[`lift_rod_${side}`].scale[2],
      `lift_rod_${side} scale`,
    );
    const rodBone = bone(`lift_rod_${side}`);
    const rod = points(rodBone);
    const mid = (axis: number) => (lowest(rod, axis) + highest(rod, axis)) / 2;
    const rest: Point = [mid(0), mid(1), lowest(rod, 2)];
    const pz = rodBone.pivot?.[2] ?? Number.NaN;
    const pin = bone(`lift_cylinder_${side}`).pivot;
    const at = (blade: number): Point => {
      const [x, y, z] = rest;
      const scaled: Point = [
        x,
        y,
        pz + (z - pz) * (1 - (blade * shorten) / length),
      ];
      const [end] = turnedCorners(
        { name: "end", pivot: pin, rotation: [-turn * blade, 0, 0] },
        { origin: scaled, size: [0, 0, 0] },
      );
      return end as Point;
    };
    return { rest, at };
  };
  it("drives blade_rig 3 px up and 3 px rearward at blade = 1, as the generator says", () => {
    expect(drive.blade_rig.position[0]).toBe(0);
    expect([ky, kz]).toEqual([3, 3]);
    const generator = readFileSync("tools/gen_bulldozer.py", "utf8");
    const constant = (name: string) =>
      capture(
        new RegExp(`^${name} = (\\d+(?:\\.\\d+)?)$`, "m"),
        generator,
        name,
      );
    expect(constant("BLADE_RAISE")).toEqual([ky]);
    expect(constant("ROD_RETRACT")).toEqual([kz]);
    for (const side of ["r", "l"]) {
      expect(drive[`lift_cylinder_${side}`].rotation.slice(1)).toEqual([0, 0]);
      const scale = drive[`lift_rod_${side}`].scale;
      expect(scale.slice(0, 2)).toEqual([1, 1]);
      const [, length] = capture(rodScale, scale[2], "rod scale");
      const rest = points(bone(`lift_rod_${side}`));
      expect(highest(rest, 2) - lowest(rest, 2)).toBeCloseTo(length ?? 0, 6);
    }
  });
  it("raises the cutting edge 3 px and pulls the blade 3 px rearward at blade = 1", () => {
    const lifted = raised(
      [...points(bone("blade_rig")), ...points(bone("blade"))],
      1,
    );
    const bottom = lowest(lifted, 1);
    expect(bottom).toBeCloseTo(3, 3);
    const trackBottom = lowest(points(bone("track_r_0")), 1);
    expect(trackBottom).toBeCloseTo(-0.425, 3);
    expect(bottom - trackBottom).toBeCloseTo(3.425, 3);
    expect(lowest(points(bone("blade")), 2)).toBeCloseTo(-38.4, 3);
    expect(lowest(raised(points(bone("blade")), 1), 2)).toBeCloseTo(-35.4, 3);
  });
  it("keeps each rod's end on its gusset top while the blade moves", () => {
    const ends = ["r", "l"].map(rodEnd);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (blade) => {
        for (const { rest, at } of ends) {
          const [target] = raised([rest], blade);
          const end = at(blade);
          // Swing and shortening are linear in the property, so between the end poses the end
          // drifts off the arc by a fraction of a pixel.
          for (const axis of [0, 1, 2])
            expect(
              Math.abs((end[axis] ?? 0) - (target?.[axis] ?? 0)),
            ).toBeLessThan(0.3);
        }
      }),
    );
    for (const { rest, at } of ends) {
      const [target] = raised([rest], 1);
      const end = at(1);
      for (const axis of [0, 1, 2])
        expect(end[axis]).toBeCloseTo(target?.[axis] ?? Number.NaN, 1);
    }
  });
  const near = (actual: number[], expected: number[]) =>
    actual.every(
      (v, axis) => Math.abs(v - (expected[axis] ?? Number.NaN)) < 0.0001,
    );
  const expectCube = (
    b: ModelBone,
    slot: number,
    min: number[],
    max: number[],
  ) => {
    const matches = (b.cubes ?? []).filter(
      (c) =>
        Object.values(c.uv).every((face) => face.uv[0] === slot) &&
        near(c.origin, min) &&
        near(
          c.origin.map((v, axis) => v + (c.size[axis] ?? 0)),
          max,
        ),
    );
    expect(matches).toHaveLength(1);
  };
  it("keeps the lowered rest pose: pivots, rods, and cube counts", () => {
    expect(bone("blade_rig").pivot).toEqual([0, 12, 2]);
    expect(bone("blade").pivot).toEqual([0, 0, -37.8]);
    for (const [side, x] of [
      ["r", -8.5],
      ["l", 8.5],
    ] as const) {
      expect(bone(`lift_cylinder_${side}`).pivot).toEqual([x, 21.4, 0.2]);
      const rod = bone(`lift_rod_${side}`);
      expect(rod.pivot).toEqual([x, 21.4, -6]);
      expect(rod.cubes).toHaveLength(1);
      expectCube(rod, 12, [x - 0.5, 20.8, -13], [x + 0.5, 22, -6]);
    }
    expect(bone("blade_rig").cubes).toHaveLength(118);
    expect(bone("blade").cubes).toHaveLength(134);
    expect(bones().flatMap((b) => b.cubes ?? [])).toHaveLength(3387);
    expect(Math.min(...points(bone("blade")).map((p) => p[1]))).toBeCloseTo(
      0,
      3,
    );
  });
  it("hangs each lift-cylinder barrel from a mount on body", () => {
    for (const [side, x] of [
      ["r", -8.5],
      ["l", 8.5],
    ] as const) {
      expectCube(
        bone(`lift_cylinder_${side}`),
        4,
        [x - 1.2, 19.9, -6],
        [x + 1.2, 22.9, 0.8],
      );
      expectCube(bone("body"), 4, [x - 1.1, 22.9, -1], [x + 1.1, 24.5, 1]);
    }
  });
});
