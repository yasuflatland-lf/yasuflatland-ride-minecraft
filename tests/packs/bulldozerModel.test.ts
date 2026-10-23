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
  it("has exactly the bone contract, each bone parented to body except root, body, blade, and door_glass", () => {
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
  const drive = () =>
    JSON.parse(
      readFileSync(`${RP}/animations/yasu_ride/bulldozer.anim.json`, "utf8"),
    ).animations["animation.yasu_ride.bulldozer.drive"].bones;
  const coefficients = () => {
    const position = drive().blade_rig.position;
    expect(position[0]).toBe(0);
    const parse = (expression: string) => {
      const match =
        /^query\.property\('yasu_ride:blade'\) \* (\d+(?:\.\d+)?)$/.exec(
          expression,
        );
      if (!match) throw new Error(`Invalid blade position: ${expression}`);
      return Number(match[1]);
    };
    return { ky: parse(position[1]), kz: parse(position[2]) };
  };
  const raised = (rest: ReturnType<typeof points>, blade: number) => {
    const { ky, kz } = coefficients();
    return rest.map(([x, y, z]) => [x, y + ky * blade, z + kz * blade]);
  };
  const rodAt = (side: string, blade: number) => {
    const scale = drive()[`lift_rod_${side}`].scale;
    expect(scale.slice(0, 2)).toEqual([1, 1]);
    const match =
      /^1 - query\.property\('yasu_ride:blade'\) \* (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)$/.exec(
        scale[2],
      );
    if (!match) throw new Error(`Invalid lift rod scale: ${scale[2]}`);
    const rod = bone(`lift_rod_${side}`);
    const pz = rod.pivot?.[2];
    if (pz === undefined) throw new Error("Missing rod pivot");
    const rest = points(rod);
    expect(Number(match[1])).toBe(3);
    expect(Number(match[2])).toBeCloseTo(
      Math.max(...rest.map((p) => p[2])) - Math.min(...rest.map((p) => p[2])),
      6,
    );
    const s = 1 - (blade * Number(match[1])) / Number(match[2]);
    return rest.map(([x, y, z]) => [x, y, pz + (z - pz) * s]);
  };
  it("raises the cutting edge 3 px and pulls the blade 3 px rearward at blade = 1", () => {
    expect(coefficients()).toEqual({ ky: 3, kz: 3 });
    const lifted = raised(
      [...points(bone("blade_rig")), ...points(bone("blade"))],
      1,
    );
    const bottom = Math.min(...lifted.map((p) => p[1] ?? Number.NaN));
    expect(bottom).toBeCloseTo(3, 3);
    expect(lifted.every((p) => (p[1] ?? Number.NaN) >= 3 - 0.0001)).toBe(true);
    const trackBottom = Math.min(...points(bone("track_r_0")).map((p) => p[1]));
    expect(trackBottom).toBeCloseTo(-0.425, 3);
    expect(bottom - trackBottom).toBeCloseTo(3.425, 3);
    expect(Math.min(...points(bone("blade")).map((p) => p[2]))).toBeCloseTo(
      -38.4,
      3,
    );
    expect(
      Math.min(
        ...raised(points(bone("blade")), 1).map((p) => p[2] ?? Number.NaN),
      ),
    ).toBeCloseTo(-35.4, 3);
  });
  it("keeps each rod between the barrel mouth and its moved bracket at every blade value", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (blade) => {
        for (const side of ["r", "l"]) {
          const zs = rodAt(side, blade).map((p) => p[2] ?? Number.NaN);
          expect(Math.max(...zs)).toBeCloseTo(2, 6);
          expect(Math.min(...zs)).toBeCloseTo(
            -10.6 + coefficients().kz * blade,
            6,
          );
        }
      }),
    );
    for (const side of ["r", "l"])
      expect(
        Math.min(...rodAt(side, 1).map((p) => p[2] ?? Number.NaN)),
      ).toBeCloseTo(-7.6, 6);
  });
  const bounds = (c: ModelCube) => [
    c.origin,
    c.origin.map((v, i) => v + (c.size[i] ?? 0)),
  ];
  const expectCube = (
    b: ModelBone,
    slot: number,
    min: number[],
    max: number[],
  ) => {
    const matches = (b.cubes ?? []).filter(
      (c) =>
        Object.values(c.uv).every((face) => face.uv[0] === slot) &&
        bounds(c).every((point, end) =>
          point.every(
            (v, axis) =>
              Math.abs(v - ([min, max][end]?.[axis] ?? Number.NaN)) < 0.0001,
          ),
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
      const rod = bone(`lift_rod_${side}`);
      expect(rod.pivot).toEqual([x, 21.4, 2]);
      expect(rod.cubes).toHaveLength(1);
      expectCube(rod, 12, [x - 0.5, 20.8, -10.6], [x + 0.5, 22, 2]);
    }
    expect(bone("blade_rig").cubes).toHaveLength(60);
    expect(bone("blade").cubes).toHaveLength(134);
    expect(bones().flatMap((b) => b.cubes ?? [])).toHaveLength(3301);
    expect(Math.min(...points(bone("blade")).map((p) => p[1]))).toBeCloseTo(
      0,
      3,
    );
  });
  it("keeps the lift-cylinder barrels on body", () => {
    for (const x of [-8.5, 8.5]) {
      expectCube(bone("body"), 4, [x - 1.2, 20.6, 2], [x + 1.2, 23.6, 7.6]);
      expectCube(
        bone("blade_rig"),
        0,
        [x - 1, 11.6, -11.8],
        [x + 1, 22.2, -10.6],
      );
    }
  });
});
