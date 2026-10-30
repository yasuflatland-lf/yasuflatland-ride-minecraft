import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { SLEEP_MESSAGES } from "../../src/domain/shared/sleep";
import { DECOR_MESSAGES } from "../../src/domain/vehicle/dock/decorMessages";
import { HINTS } from "../../src/domain/vehicle/hints";
import {
  CAMPER_FURNITURE,
  CEILING_LIGHTS,
  DECOR_SPOTS,
  type DecorSlot,
} from "../../src/domain/vehicle/kinds/camper/furniture";
import { CAMPER_PROFILE } from "../../src/domain/vehicle/kinds/camper/profile";
import {
  CAMPER_DOOR_COMPONENT,
  SEAT_FILLER_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../support/defined";
import { readRgbaPng } from "../support/png";
import { assertOneAxis, multipleAxes } from "./oneAxis";

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
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
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
const end = (cube: Cube, axis: number) =>
  (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0);
const ROOF = 64;
const ALUMINIUM_SLOT = 36;
const isRoofRail = (cube: Cube) =>
  cube.uv.north?.uv[0] === ALUMINIUM_SLOT &&
  (cube.origin[1] ?? 0) >= ROOF &&
  ((cube.origin[0] ?? 0) >= 22 || end(cube, 0) <= -22);

const readPng = (path: string) => readRgbaPng(`${RP}/${path}.png`);

describe("camper model assets (ADR 0067)", () => {
  it("allows compound rotations only in declared assemblies (ADR 0167)", () => {
    const cubes = bones.flatMap((bone) => bone.cubes ?? []);
    const assemblies = { slanted: cubes.filter(multipleAxes) };
    expect(assemblies.slanted).toHaveLength(6);
    expect(() => assertOneAxis(cubes, assemblies)).not.toThrow();
  });

  it("uses the production geometry identifier with no test namespace", () => {
    expect(geometry.description.identifier).toBe("geometry.yasu_ride.camper");
    expect(geometryText).not.toContain("yasu_ride_test");
  });

  it("connects every standard bone to root without cycles", () => {
    expect(bones.map((b) => b.name).sort()).toEqual(
      [
        "root",
        "body",
        "bunk",
        "headlights",
        "ceiling_lights",
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
        "cabinet_sink_door",
        "cabinet_stove_door",
        "fridge_top_door",
        "fridge_bottom_door",
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

  it("fits the upper bunk in its mirrored cells with only slim posts below the deck (ADR 0182)", () => {
    const bunk = bone("bunk");
    expect(bunk.parent).toBe("body");
    expect(bunk.pivot).toEqual([0, 0, 0]);
    expect(bunk.rotation).toBeUndefined();
    const cubes = (bunk.cubes ?? []).map((cube) => {
      expect(cube.rotation).toBeUndefined();
      const [x, y, z] = [0, 1, 2].map((axis) =>
        defined(cube.origin[axis], "bunk origin"),
      ) as [number, number, number];
      const [width, height, depth] = [0, 1, 2].map((axis) =>
        defined(cube.size[axis], "bunk size"),
      ) as [number, number, number];
      return { x, y, z, width, height, depth, top: y + height };
    });
    const panels = cubes.filter((cube) => cube.y >= 32);
    const posts = cubes.filter((cube) => cube.y < 32);
    expect(panels.length).toBeGreaterThanOrEqual(4);
    expect(posts).toHaveLength(2);
    const deck = defined(
      panels.find((cube) => cube.y === 32),
      "bunk deck",
    );
    expect([deck.x, deck.y, deck.z]).toEqual([8, 32, 24]);
    expect(deck.width).toBe(15);
    expect(deck.depth).toBe(31);
    for (const post of posts) {
      expect(post.y).toBe(16);
      expect(post.x).toBe(8);
      expect(post.width).toBeLessThanOrEqual(1.5);
      expect(post.depth).toBeLessThanOrEqual(1.5);
      expect(post.top).toBeLessThanOrEqual(deck.top);
    }
    for (const { x, z, width, depth, top } of cubes) {
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x + width).toBeLessThanOrEqual(24);
      expect(z).toBeGreaterThanOrEqual(24);
      expect(z + depth).toBeLessThanOrEqual(56);
      expect(top).toBeLessThan(48);
      // Horizontal separation also keeps the view of the cabinet and aisle lights clear.
      for (const [left, right] of [
        [-22.8, -10],
        [-4, 4],
      ] as const) {
        expect(x >= right || x + width <= left).toBe(true);
      }
    }
    const top = Math.max(...cubes.map((cube) => cube.top));
    expect(top - 32).toBeLessThanOrEqual(9);
    expect(top).toBeLessThan(38);
    // BUNK_TOP in tools/gen_camper.py, which camper_bunk.block.json sizes its box from.
    expect(top).toBe(37.5);
    // The bunk block's selection box is as high as the bunk above its cell bottom (ADR 0182).
    const block = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/blocks/yasu_ride/camper_bunk.block.json",
        "utf8",
      ),
    );
    expect(
      block["minecraft:block"].components["minecraft:selection_box"].size[1],
    ).toBe(top - 32);
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

  it("draws the side stripe's W as mirrored single-cube strokes on a flat bottom (#459)", () => {
    // The PALETTE order in tools/gen_camper.py puts the stripe in slot 6.
    const strokes = (bone("body").cubes ?? []).filter(
      (cube) => cube.uv.north?.uv[0] === 6 && (cube.rotation?.[0] ?? 0) !== 0,
    );
    const frontAxle = -31.5;
    const wBottom = 2 * 7.8 + 2 + 1.5;
    for (const side of [1, -1]) {
      const own = strokes.filter(
        (cube) => Math.sign(cube.origin[0] ?? 0) === side,
      );
      expect(own, `side ${side}`).toHaveLength(4);
      for (const cube of own) {
        const twin = own.find(
          (other) =>
            Math.abs(
              (other.pivot?.[2] ?? 0) + (cube.pivot?.[2] ?? 0) - 2 * frontAxle,
            ) < 0.002 &&
            Math.abs((other.pivot?.[1] ?? 0) - (cube.pivot?.[1] ?? 0)) <
              0.002 &&
            Math.abs((other.rotation?.[0] ?? 0) + (cube.rotation?.[0] ?? 0)) <
              0.002,
        );
        expect(twin, JSON.stringify(cube.pivot)).toBeDefined();
        expect(twin?.size).toEqual(cube.size);
      }
      // In game a negative x rotation tips a cube's top toward +z (ADR 0051), so
      // the outer arms must lean away from the axle and the inner strokes toward it.
      const armLength = Math.max(...own.map((cube) => cube.size[1] ?? 0));
      for (const cube of own) {
        const topLean = -Math.sign(cube.rotation?.[0] ?? 0);
        const awayFromAxle = Math.sign((cube.pivot?.[2] ?? 0) - frontAxle);
        const isArm = cube.size[1] === armLength;
        expect(topLean, JSON.stringify(cube.pivot)).toBe(
          isArm ? awayFromAxle : -awayFromAxle,
        );
      }
      const lowest = own.map((cube) => {
        const angle = ((cube.rotation?.[0] ?? 0) * Math.PI) / 180;
        const py = cube.pivot?.[1] ?? 0;
        const pz = cube.pivot?.[2] ?? 0;
        return Math.min(
          ...[0, 1, 2, 3].map((corner) => {
            const y =
              (cube.origin[1] ?? 0) + (corner & 1) * (cube.size[1] ?? 0);
            const z =
              (cube.origin[2] ?? 0) + ((corner >> 1) & 1) * (cube.size[2] ?? 0);
            return py + (y - py) * Math.cos(angle) - (z - pz) * Math.sin(angle);
          }),
        );
      });
      // Geometry coordinates are rounded to three decimal places by the generator.
      for (const y of lowest) expect(y).toBeCloseTo(wBottom, 2);
    }
  });

  it("ends the stripe on the W's outer arm inner edges, with no step at their tops (ADR 0145)", () => {
    const frontAxle = -31.5;
    const stripeBand: [number, number] = [29.5, 31.5];
    const cubes = (bone("body").cubes ?? []).filter(
      (cube) => cube.uv.north?.uv[0] === 6,
    );
    const arms = cubes.filter((cube) => (cube.rotation?.[0] ?? 0) !== 0);
    const armLength = Math.max(...arms.map((cube) => cube.size[1] ?? 0));
    for (const xSide of [1, -1]) {
      for (const zSide of [1, -1]) {
        const arm = arms.find(
          (cube) =>
            cube.size[1] === armLength &&
            Math.sign(cube.origin[0] ?? 0) === xSide &&
            Math.sign((cube.pivot?.[2] ?? 0) - frontAxle) === zSide,
        );
        expect(arm, `side ${xSide} ${zSide}`).toBeDefined();
        const cube = arm as Cube;
        const angle = ((cube.rotation?.[0] ?? 0) * Math.PI) / 180;
        const py = cube.pivot?.[1] ?? 0;
        const pz = cube.pivot?.[2] ?? 0;
        // The arm's edge on the axle side, as the (z, y) corners of its rotated end faces; in game
        // a negative x rotation tips the top toward +z (ADR 0051).
        const edges = [0, 1].map((faceZ) =>
          [0, 1].map((faceY) => {
            const y = (cube.origin[1] ?? 0) + faceY * (cube.size[1] ?? 0);
            const z = (cube.origin[2] ?? 0) + faceZ * (cube.size[2] ?? 0);
            return [
              pz - (y - py) * Math.sin(angle) + (z - pz) * Math.cos(angle),
              py + (y - py) * Math.cos(angle) + (z - pz) * Math.sin(angle),
            ];
          }),
        );
        const mean = (edge: number[][]) =>
          ((edge[0]?.[0] ?? 0) + (edge[1]?.[0] ?? 0)) / 2;
        const inner = [...edges].sort(
          (a, b) =>
            Math.abs(mean(a) - frontAxle) - Math.abs(mean(b) - frontAxle),
        )[0] as number[][];
        const [a, b] = inner as [number[], number[]];
        const edgeZ = (y: number) =>
          (a[0] ?? 0) +
          (((b[0] ?? 0) - (a[0] ?? 0)) * (y - (a[1] ?? 0))) /
            ((b[1] ?? 0) - (a[1] ?? 0));
        const inBand = cubes.filter(
          (other) =>
            (other.rotation?.[0] ?? 0) === 0 &&
            Math.sign(other.origin[0] ?? 0) === xSide &&
            Math.sign(cubeCenter(other, 2) - frontAxle) === zSide &&
            (other.origin[1] ?? 0) >= stripeBand[0] - 0.001 &&
            (other.origin[1] ?? 0) + (other.size[1] ?? 0) <=
              (stripeBand[1] ?? 0) + 0.001,
        );
        expect(inBand.length).toBeGreaterThan(0);
        for (const other of inBand) {
          for (const y of [
            other.origin[1] ?? 0,
            (other.origin[1] ?? 0) + (other.size[1] ?? 0),
          ]) {
            for (const z of [
              other.origin[2] ?? 0,
              (other.origin[2] ?? 0) + (other.size[2] ?? 0),
            ]) {
              // Nothing of the stripe lies on the axle side of the arm's edge line.
              expect(zSide * (z - edgeZ(y))).toBeGreaterThan(-0.005);
            }
          }
        }
        // The arm's edge itself meets the stripe's lower edge, and the stripe's top meets that line.
        expect(
          inBand.some(
            (other) =>
              Math.abs(
                (zSide > 0
                  ? (other.origin[2] ?? 0)
                  : (other.origin[2] ?? 0) + (other.size[2] ?? 0)) -
                  edgeZ(stripeBand[1] ?? 0),
              ) < 0.01,
          ),
        ).toBe(true);
      }
    }
  });

  const paletteBlock =
    readFileSync("tools/gen_camper.py", "utf8").match(
      /^PALETTE = \{\n([\s\S]*?)^\}/m,
    )?.[1] ?? "";
  const paletteSlots = [...paletteBlock.matchAll(/^\s+"(\w+)":/gm)].map(
    (m) => m[1],
  );
  const swatch = (c: Cube, name: string) => {
    const slot = paletteSlots.indexOf(name);
    expect(slot).toBeGreaterThanOrEqual(0);
    return c.uv.north?.uv[0] === slot;
  };
  const cubeCenter = (c: Cube, axis: number) =>
    (c.origin[axis] ?? 0) + (c.size[axis] ?? 0) / 2;

  it("replaces the mid-body amber box with symmetric static rear signals (#596)", () => {
    const body = bone("body").cubes ?? [];
    const amber = bones
      .flatMap((b) => b.cubes ?? [])
      .filter((c) => swatch(c, "amber"));
    expect(
      amber.filter(
        (c) =>
          Math.abs(cubeCenter(c, 0)) >= 23.5 &&
          cubeCenter(c, 1) >= 50 &&
          cubeCenter(c, 1) < 60,
      ),
    ).toEqual([]);
    expect(
      amber.filter(
        (c) => Math.abs(cubeCenter(c, 2)) <= 40 && (c.origin[1] ?? 0) < 60.4,
      ),
    ).toEqual([]);
    for (const material of ["chrome", "amber"]) {
      const signals = body.filter(
        (c) =>
          swatch(c, material) &&
          Math.abs(Math.abs(cubeCenter(c, 0)) - 22.9) < 0.05 &&
          Math.abs(cubeCenter(c, 1) - 15) < 0.05 &&
          cubeCenter(c, 2) > 50,
      );
      const left = signals.filter((c) => cubeCenter(c, 0) < 0);
      const right = signals.filter((c) => cubeCenter(c, 0) > 0);
      expect(left.length).toBeGreaterThan(0);
      expect(left.map((c) => c.size)).toEqual(right.map((c) => c.size));
      for (const c of left)
        expect(
          right.some(
            (r) =>
              Math.abs(cubeCenter(c, 0) + cubeCenter(r, 0)) < 0.002 &&
              cubeCenter(c, 2) === cubeCenter(r, 2),
          ),
        ).toBe(true);
    }
    expect(
      (bone("headlights").cubes ?? []).filter((c) => swatch(c, "amber")),
    ).toEqual([]);
  });

  it("lights only the roof clearance, rear roof, and tail lamps with the headlights (ADR 0184)", () => {
    const lit: Record<string, string[]> = {
      headlights: ["lens", "marker_amber", "marker_red"],
      ceiling_lights: ["dome"],
    };
    const litSwatches = Object.values(lit).flat();
    for (const b of bones)
      for (const c of b.cubes ?? [])
        for (const name of litSwatches)
          if (swatch(c, name))
            expect(lit[b.name] ?? [], `${b.name} ${name}`).toContain(name);
    const lampCenters = (name: string) =>
      [
        ...new Set(
          (bone("headlights").cubes ?? [])
            .filter((c) => swatch(c, name))
            .map((c) =>
              [0, 1, 2].map((axis) => cubeCenter(c, axis).toFixed(2)).join(),
            ),
        ),
      ].sort();
    const at = (points: number[][]) =>
      points.map((p) => p.map((v) => v.toFixed(2)).join()).sort();
    const roofLip = [-21.5, -6, 0, 6, 21.5];
    expect(lampCenters("marker_amber")).toEqual(
      at([
        ...roofLip.map((x) => [x, 64.3, -52.5]),
        ...roofLip.filter((x) => x !== 0).map((x) => [x, 64.85, -52.5]),
      ]),
    );
    expect(lampCenters("marker_red")).toEqual(
      at([
        ...[-12, -4, 4, 12].map((x) => [x, 61.8, 60.525]),
        ...[-19, 19].map((x) => [x, 15, 59.11]),
      ]),
    );
  });

  it("aligns both entry handles half a pixel below the stripe (#596)", () => {
    const door = bone("door_entry");
    expect(door.pivot).toEqual([-24, 0, -7]);
    const handles = (door.cubes ?? []).filter(
      (c) => swatch(c, "chrome") && c.origin[2] === 4.5 && c.size[2] === 1.5,
    );
    expect(handles).toHaveLength(2);
    expect(handles.map((c) => c.origin[0] ?? 0).sort((a, b) => a - b)).toEqual([
      -24.6, -23,
    ]);
    for (const c of handles) {
      expect(c.origin[1]).toBe(28);
      expect(c.size).toEqual([0.6, 1, 1.5]);
    }
    const stripe = (door.cubes ?? []).filter((c) => swatch(c, "stripe"));
    expect(stripe).toHaveLength(1);
    expect(stripe[0]?.origin[1]).toBe(29.5);
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
    const ivory = paletteSlots.indexOf("ivory");
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
    // The pad runs from 33.4 to 35, just under the windshield's lower frame at 36 (#422).
    const pads = body.filter(
      (cube) =>
        near(cube.origin[1], 33.4) && near(cube.size[1], 1.6) && !cube.rotation,
    );
    expect(pads).toHaveLength(1);
    const pad = pads[0] as Cube;
    const [padX0, padX1] = extent(pad, 0);
    const [, padTop] = extent(pad, 1);
    expect(padTop).toBeLessThan(36);
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

  it("ends the steering column inside the raised dash body, below the console (#422)", () => {
    const body = bone("body").cubes ?? [];
    const dashBodies = body.filter(
      (cube) =>
        near(cube.origin[1], 16) &&
        near(cube.size[0], 46) &&
        near(cube.size[2], 7),
    );
    expect(dashBodies).toHaveLength(1);
    const dash = dashBodies[0] as Cube;
    const steering = bone("steering");
    const column = (steering.cubes ?? []).find((cube) =>
      near(cube.size[2], 15.4),
    ) as Cube;
    expect(column).toBeDefined();
    const lean = ((steering.rotation?.[0] ?? 0) * Math.PI) / 180;
    const [, py, pz] = steering.pivot as [number, number, number];
    // The corners of the column's far end, in the wheel's own plane, turned by the bone's lean.
    const [cx0, cx1] = extent(column, 0);
    const [cy0, cy1] = extent(column, 1);
    const [cz0] = extent(column, 2);
    const corners = [cx0, cx1].flatMap((x) =>
      [cy0, cy1].map((y) => {
        const ly = y - py;
        const lz = cz0 - pz;
        return [
          x,
          py + ly * Math.cos(lean) + lz * Math.sin(lean),
          pz - ly * Math.sin(lean) + lz * Math.cos(lean),
        ];
      }),
    );
    const inDash = corners.filter((corner) =>
      corner.every((v, axis) => {
        const [lo, hi] = extent(dash, axis);
        return v > lo && v < hi;
      }),
    );
    expect(inDash.length).toBeGreaterThan(0);
    const consoles = body.filter(
      (cube) =>
        near(cube.size[0], 17.9) && near(cube.size[1], 8) && !cube.rotation,
    );
    expect(consoles).toHaveLength(1);
    const [consoleBottom] = extent(consoles[0] as Cube, 1);
    for (const corner of corners)
      expect(corner[1] ?? 0).toBeLessThan(consoleBottom);
  });

  it("generates all 16 equally sized paints, changing only the three accent swatches and no region texel", () => {
    const files = readdirSync(`${RP}/textures/entity/yasu_ride`).filter(
      (name) =>
        /^camper(?:_\w+)?\.png$/.test(name) && !name.startsWith("camper_lit"),
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
      expect(texture.pixels.subarray(khaki.width * 4), paint).toEqual(
        khaki.pixels.subarray(khaki.width * 4),
      );
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

  expect(components["minecraft:rideable"].family_types).toEqual([
    "player",
    SEAT_FILLER_FAMILY,
  ]);
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
  // The PALETTE order in tools/gen_camper.py puts glass in slot 13 and the ceiling light
  // lenses, whose alpha 0 lights them under the emissive material, last (ADR 0115).
  const glassSlot = 13;
  const domeSlot = 33;
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
        else if (i === domeSlot || i >= 38) expect(alpha, paint).toBe(0);
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
  const STEPS = 4;

  // A slot's spot in model pixels: x = 16 * left, z = -16 * forward (the front is -z, ADR 0009).
  const slotXZ = (slot: DecorSlot) => {
    const spot = DECOR_SPOTS[slot.spot ?? 0] ?? { left: 0, forward: 0 };
    return {
      x: 16 * slot.cell.x + spot.left,
      z: -16 * slot.cell.z - spot.forward,
    };
  };

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
  // Points on every body cube, rotated ones included, STEPS + 1 per edge.
  const bodyPoints = () =>
    (bone("body").cubes ?? []).flatMap((cube) => {
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

  // The slots that share their furniture cell with another item (ADR 0108), and the stove's.
  const SHARED_KINDS = ["stove", "fridge", "table", "wall_cabinet"];

  it("puts every standing decor slot but the stove's on the model's top surface at its spot and runs the ceiling hook from the ceiling plate to the top of its cell (ADR 0093, 0099, 0102, 0108)", () => {
    // The stove's slot stands on its burner's grate, checked in the next test.
    const slots = CAMPER_FURNITURE.filter((f) => f.kind !== "stove").flatMap(
      (f) => f.slots,
    );
    expect(slots).toHaveLength(16);
    const unrotatedCubes = bones
      .filter((b) => b.rotation === undefined)
      .flatMap((b) => b.cubes ?? [])
      .filter((cube) => cube.rotation === undefined);
    for (const slot of slots) {
      const { x, z } = slotXZ(slot);
      const bottom = 16 * slot.cell.layer;
      const covering = unrotatedCubes.filter((cube) => {
        const [ox = 0, , oz = 0] = cube.origin;
        const [sx = 0, , sz = 0] = cube.size;
        return ox <= x && x <= ox + sx && oz <= z && z <= oz + sz;
      });
      if (slot.hanging !== true) {
        // A cabinet compartment has its top panel and the ceiling over it, so only its
        // floor, in the lower half of the cell, counts (ADR 0114).
        const reach = slot.door === undefined ? 16 : 8;
        const tops = covering.flatMap((cube) => {
          const [, oy = 0] = cube.origin;
          const [, sy = 0] = cube.size;
          return oy < bottom + reach &&
            oy + sy > bottom &&
            oy + sy < bottom + reach
            ? [oy + sy]
            : [];
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

  it("hangs the wall cabinet from the ceiling down to y 50, over the counter window, with a floor and a top panel 9 px apart (ADR 0103, 0113, 0114)", () => {
    // The middle of the cell (-1, -1) the cabinet's sink compartment hangs in.
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
    expect(covering).toContainEqual([50, 51]);
    expect(covering).toContainEqual([60, 61]);
    expect(covering.some(([lo, hi]) => lo < 60 && hi > 51)).toBe(false);
    expect(covering.some(([lo, hi]) => lo < 50 && hi > 32)).toBe(false);
  });

  it("stands the stove slot on top of the grate of its one burner in the cell middle (ADR 0107, 0112)", () => {
    const points = bodyPoints();
    const burners =
      CAMPER_FURNITURE.find((f) => f.kind === "stove")?.slots ?? [];
    expect(burners.map((s) => [s.id, s.spot ?? 0])).toEqual([["stove", 0]]);
    for (const slot of burners) {
      const { x, z } = slotXZ(slot);
      const bottom = 16 * slot.cell.layer;
      // The burner's grate and prongs, and nothing above the cell.
      const tops = points
        .filter(
          ([px = 0, py = 0, pz = 0]) =>
            Math.abs(px - x) < 2 &&
            Math.abs(pz - z) < 2 &&
            py > bottom &&
            py < bottom + 16,
        )
        .map(([, py = 0]) => py);
      expect(tops.length, slot.id).toBeGreaterThan(0);
      // The burner rises above the bare plate at 14 px, so the item cannot stand on the plate.
      expect(Math.max(...tops) - bottom, slot.id).toBeGreaterThan(14);
      expect(Math.ceil(Math.max(...tops) - bottom - 1e-9), slot.id).toBe(
        slot.height,
      );
    }
  });

  it("keeps every body cube, rotated ones included, out of every standing item on each stove, fridge, table, and wall cabinet slot, and the two items on the table or in a storage compartment apart (ADR 0100, 0105, 0108, 0114, 0123)", () => {
    const points = bodyPoints();
    // Each standing item's box from its block model: half its width along the camper's left
    // (model x), half its depth forward (model z), and its height. The decor block turns the
    // model with the camper, so these axes hold in every facing.
    const gear = (
      JSON.parse(readFileSync("tools/camping_gear.json", "utf8")) as {
        id: string;
        hanging: boolean;
      }[]
    ).filter((g) => !g.hanging);
    const items = gear.map(({ id }) => {
      const geo = JSON.parse(
        readFileSync(`${RP}/models/blocks/yasu_ride/${id}.geo.json`, "utf8"),
      ) as { "minecraft:geometry": { bones: { cubes: Cube[] }[] }[] };
      const cubes = geo["minecraft:geometry"].flatMap((g) =>
        g.bones.flatMap((b) => b.cubes),
      );
      const reach = (axis: number) =>
        Math.max(
          ...cubes.flatMap((c) => [
            Math.abs(c.origin[axis] ?? 0),
            Math.abs((c.origin[axis] ?? 0) + (c.size[axis] ?? 0)),
          ]),
        );
      return { id, halfX: reach(0), halfZ: reach(2), height: reach(1) };
    });
    expect(items.length).toBeGreaterThan(0);
    // Only the stove and the furniture that holds two items are held to this so far: the sink
    // rim rises 0.15 px into the counter's footprint and the dashboard's slanted cubes into the
    // dashboard's.
    const standing = CAMPER_FURNITURE.filter((f) =>
      SHARED_KINDS.includes(f.kind),
    ).flatMap((f) => f.slots);
    expect(standing).toHaveLength(11);
    // The table's or a storage compartment's two items stand apart for any two items (ADR
    // 0108, 0114, 0123).
    for (const [a, b] of [
      ["fridge_bottom_rear", "fridge_bottom_front"],
      ["fridge_top_rear", "fridge_top_front"],
      ["table", "table_aisle"],
      ["cabinet_sink_rear", "cabinet_sink_front"],
      ["cabinet_stove_rear", "cabinet_stove_front"],
    ]) {
      const one = standing.find((s) => s.id === a);
      const two = standing.find((s) => s.id === b);
      if (one === undefined || two === undefined) throw new Error(`${a} ${b}`);
      const p = slotXZ(one);
      const q = slotXZ(two);
      expect(16 * one.cell.layer + one.height).toBe(
        16 * two.cell.layer + two.height,
      );
      const touching = items.flatMap((i) =>
        items
          .filter(
            (j) =>
              Math.abs(p.x - q.x) < i.halfX + j.halfX - 1e-9 &&
              Math.abs(p.z - q.z) < i.halfZ + j.halfZ - 1e-9,
          )
          .map((j) => `${a} ${i.id} and ${b} ${j.id}`),
      );
      expect(touching).toEqual([]);
    }
    const halfX = Math.max(...items.map((i) => i.halfX));
    const halfZ = Math.max(...items.map((i) => i.halfZ));
    const height = Math.max(...items.map((i) => i.height));
    for (const slot of standing) {
      const { x, z } = slotXZ(slot);
      const top = 16 * slot.cell.layer + slot.height;
      // Narrowing to the points near the slot once keeps the per-item scans short; the run
      // with coverage in CI exceeded the 5 s test timeout scanning every point per item.
      const near = points.filter(
        ([px = 0, py = 0, pz = 0]) =>
          Math.abs(px - x) < halfX &&
          Math.abs(pz - z) < halfZ &&
          py > top + 1e-6 &&
          py < top + height,
      );
      for (const item of items) {
        const intruding = near.filter(
          ([px = 0, py = 0, pz = 0]) =>
            Math.abs(px - x) < item.halfX &&
            Math.abs(pz - z) < item.halfZ &&
            py > top + 1e-6 &&
            py < top + item.height,
        );
        expect(intruding, `${slot.id} ${item.id}`).toEqual([]);
      }
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

  it("hinges both fridge doors at the fridge's front end on its aisle face, the shorter top door over the taller bottom one, and swings each open into the aisle cell beside the fridge (ADR 0123)", () => {
    const heights: number[] = [];
    for (const name of ["fridge_bottom_door", "fridge_top_door"]) {
      const door = bone(name);
      expect(door.pivot).toEqual([-8.3, 0, -23.3]);
      expect(door.parent).toBe("body");
      expect(door.rotation).toBeUndefined();
      expect(door.cubes?.length).toBeGreaterThan(0);
      const ys: number[] = [];
      for (const cube of door.cubes ?? [])
        for (const corner of [0, 1].flatMap((i) =>
          [0, 1].flatMap((j) =>
            [0, 1].map((k) =>
              [i, j, k].map(
                (n, axis) =>
                  (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
              ),
            ),
          ),
        )) {
          const [cx = 0, cy = 0, cz = 0] = corner;
          ys.push(cy);
          // Shut, the door covers the fridge's aisle face, in the fridge's cell row (z = 1).
          expect(cx, name).toBeGreaterThanOrEqual(-9 - 1e-6);
          expect(cx, name).toBeLessThanOrEqual(-7.5);
          expect(cz, name).toBeGreaterThanOrEqual(-24);
          expect(cz, name).toBeLessThanOrEqual(-8);
          expect(cy, name).toBeGreaterThanOrEqual(16);
          expect(cy, name).toBeLessThanOrEqual(49);
          // Open, it stands in the aisle cell, local x 0, beside the fridge.
          const [ox = 0, , oz = 0] = turn(corner, door.pivot, [0, 90, 0]);
          expect(ox, name).toBeGreaterThanOrEqual(-9 - 1e-6);
          expect(ox, name).toBeLessThanOrEqual(8);
          expect(oz, name).toBeGreaterThanOrEqual(-24);
          expect(oz, name).toBeLessThanOrEqual(-8);
        }
      heights.push(Math.max(...ys) - Math.min(...ys));
    }
    const [bottom = 0, top = 0] = heights;
    expect(top).toBeLessThan(bottom);
  });

  it("hinges each wall cabinet door at the cabinet's outer end and swings it open into the aisle cell beside its compartment, under the ceiling (ADR 0114)", () => {
    for (const [name, pivotZ, angle, cellZ] of [
      ["cabinet_sink_door", 9, 90, [8, 24]],
      ["cabinet_stove_door", 39, -90, [24, 40]],
    ] as const) {
      const door = bone(name);
      expect(door.pivot).toEqual([-9.5, 0, pivotZ]);
      expect(door.parent).toBe("body");
      expect(door.cubes?.length).toBeGreaterThan(0);
      for (const cube of door.cubes ?? [])
        for (const corner of [0, 1].flatMap((i) =>
          [0, 1].flatMap((j) =>
            [0, 1].map((k) =>
              [i, j, k].map(
                (n, axis) =>
                  (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
              ),
            ),
          ),
        )) {
          const [cx = 0, cy = 0, cz = 0] = corner;
          // Shut, the door covers its compartment on the aisle face of the cabinet.
          expect(cx).toBeGreaterThanOrEqual(-10 - 1e-6);
          expect(cx).toBeLessThanOrEqual(-9.2 + 1e-6);
          expect(cz).toBeGreaterThanOrEqual(cellZ[0]);
          expect(cz).toBeLessThanOrEqual(cellZ[1]);
          expect(cy).toBeGreaterThanOrEqual(50);
          expect(cy).toBeLessThanOrEqual(61);
          // Open, it stands in the aisle cell, local x 0, beside its compartment.
          const [ox = 0, , oz = 0] = turn(corner, door.pivot, [0, angle, 0]);
          expect(ox, name).toBeGreaterThanOrEqual(-10 - 1e-6);
          expect(ox, name).toBeLessThanOrEqual(8);
          expect(oz, name).toBeGreaterThanOrEqual(cellZ[0]);
          expect(oz, name).toBeLessThanOrEqual(cellZ[1]);
        }
    }
  });

  it("swings the open shower-toilet door into the aisle cell just in front of the rear wall, whose plate then takes taps on it (ADR 0118)", () => {
    const door = bone("shower_door");
    // The open angle of the camper's shower_door animation, checked above.
    const angle = -90;
    // The aisle cell (local 0, -3) spans x -8..8 and z 40..56; the rear wall cell's plate
    // starts at z 56, and the wall is laid in layers 1 to 3 (y 16..64).
    const WALL_FACE = 56;
    const GAP = 4;
    for (const cube of door.cubes ?? [])
      for (const corner of [0, 1].flatMap((i) =>
        [0, 1].flatMap((j) =>
          [0, 1].map((k) =>
            [i, j, k].map(
              (n, axis) =>
                (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
            ),
          ),
        ),
      )) {
        const [ox = 0, oy = 0, oz = 0] = turn(corner, door.pivot, [
          0,
          angle,
          0,
        ]);
        expect(ox).toBeGreaterThanOrEqual(-8 - 1e-6);
        expect(ox).toBeLessThanOrEqual(8 + 1e-6);
        expect(oy).toBeGreaterThanOrEqual(16);
        expect(oy).toBeLessThanOrEqual(64);
        expect(oz).toBeGreaterThanOrEqual(WALL_FACE - GAP);
        expect(oz).toBeLessThanOrEqual(WALL_FACE);
      }
  });
});

describe("camper ceiling lights (ADR 0115)", () => {
  const PX = 16;
  // The ceiling liner's underside (tools/gen_camper.py CEIL - 0.2) and the top of a standing
  // player's head on the floor (16 px) at 1.8 blocks.
  const LINER = 60.8;
  const HEAD = 16 + 1.8 * PX;
  const lights = bone("ceiling_lights");
  const cubes = lights.cubes ?? [];
  const center = (cube: Cube, axis: number) =>
    (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0) / 2;

  it("hangs one light from the liner over each light cell of the aisle, above every head", () => {
    expect(lights.parent).toBe("body");
    expect(cubes.length).toBeGreaterThan(0);
    for (const cube of cubes) {
      expect(cube.origin[1] ?? 0).toBeGreaterThan(HEAD);
      expect((cube.origin[1] ?? 0) + (cube.size[1] ?? 0)).toBeLessThanOrEqual(
        LINER + 1e-6,
      );
    }
    // Each light's rim meets the liner, so it does not float under the ceiling.
    expect(
      cubes.filter((c) => (c.origin[1] ?? 0) + (c.size[1] ?? 0) > LINER - 1e-6),
    ).toHaveLength(CEILING_LIGHTS.length);
    // Model z is -16 times the local cell z, and the mirrored model x is minus the local x.
    const centers = new Set(
      cubes.map((c) => `${center(c, 0)},${center(c, 2)}`),
    );
    expect(centers).toEqual(
      new Set(CEILING_LIGHTS.map((c) => `${-c.x * PX + 0},${-c.z * PX}`)),
    );
    for (const cell of CEILING_LIGHTS) expect(cell.layer).toBe(2);
  });

  it("stays inside the aisle cells of its lights", () => {
    for (const cube of cubes) {
      const cell = CEILING_LIGHTS.find(
        (c) => -c.z * PX === center(cube, 2) && -c.x * PX === center(cube, 0),
      );
      expect(cell).toBeDefined();
      for (const axis of [0, 2]) {
        const mid = axis === 0 ? -(cell?.x ?? 0) * PX : -(cell?.z ?? 0) * PX;
        expect(cube.origin[axis] ?? 0).toBeGreaterThanOrEqual(mid - PX / 2);
        expect(
          (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0),
        ).toBeLessThanOrEqual(mid + PX / 2);
      }
    }
  });

  it("keeps the ceiling lenses on the unlit material in the base pass", () => {
    const entries: Record<string, string>[] = camperRender.materials;
    expect(entries).toContainEqual({
      ceiling_lights: "Material.lamp",
    });
    const property = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/entities/yasu_ride/camper.se.json",
        "utf8",
      ),
    )["minecraft:entity"].description.properties["yasu_ride:ceiling_lights"];
    expect(property).toEqual({
      type: "bool",
      default: false,
      client_sync: true,
    });
  });
});

describe("camper rear-right vent lid (ADR 0146, 0157)", () => {
  // Slots in the PALETTE order of tools/gen_camper.py.
  const WHITE_SLOT = 0;
  const KHAKI_SLOT = 4;
  const STEEL_SLOT = 5;
  const BLACK_SLOT = 7;
  const CHROME_SLOT = 10;
  const WALL_IN_SLOT = 22;
  const TRIM_BEIGE_SLOT = 37;
  it("removes the rear-right pane and closes the outer wall, lining, and band", () => {
    expect(
      (bone("glass").cubes ?? []).filter(
        (c) =>
          (c.origin[0] ?? 0) < -23 && (c.origin[2] ?? 0) < 50 && end(c, 2) > 38,
      ),
    ).toEqual([]);
    for (const [slot, x] of [
      [WHITE_SLOT, -23.5],
      [WALL_IN_SLOT, -22.9],
      [KHAKI_SLOT, -24.05],
    ] as const) {
      expect(
        (bone("body").cubes ?? []).some(
          (c) =>
            c.uv.north?.uv[0] === slot &&
            [x, 42, 45].every(
              (v, axis) => v >= (c.origin[axis] ?? 0) && v <= end(c, axis),
            ),
        ),
      ).toBe(true);
    }
  });
  const lid = () =>
    (bone("body").cubes ?? []).filter(
      (c) =>
        end(c, 0) <= -24.0999 &&
        (c.origin[1] ?? 0) >= 36.5 &&
        end(c, 1) <= 48.5001 &&
        (c.origin[2] ?? 0) >= 40.5 &&
        end(c, 2) <= 49.5001,
    );
  const covers = (c: Cube, y: number, z: number) =>
    (c.origin[1] ?? 0) <= y &&
    y <= end(c, 1) &&
    (c.origin[2] ?? 0) <= z &&
    z <= end(c, 2);
  it("frames a grey-beige panel in a raised aluminium rim with cut corners", () => {
    const cubes = lid();
    for (const c of cubes)
      for (const face of Object.values(c.uv))
        if (face.uv[1] === 0)
          expect([
            TRIM_BEIGE_SLOT,
            STEEL_SLOT,
            BLACK_SLOT,
            CHROME_SLOT,
            ALUMINIUM_SLOT,
          ]).toContain(face.uv[0]);
        else {
          expect(face.uv[1]).toBeGreaterThan(0);
          expect(
            (face.uv[0] ?? 0) + (face.uv_size[0] ?? 0),
          ).toBeLessThanOrEqual(geometry.description.texture_width);
          expect(
            (face.uv[1] ?? 0) + (face.uv_size[1] ?? 0),
          ).toBeLessThanOrEqual(geometry.description.texture_height);
        }
    const rim = cubes.filter((c) =>
      [CHROME_SLOT, ALUMINIUM_SLOT].includes(c.uv.north?.uv[0] ?? -1),
    );
    for (const c of rim) {
      expect(c.origin[0]).toBeCloseTo(-24.5, 4);
      expect(end(c, 0)).toBeCloseTo(-24.1, 4);
    }
    for (const [axis, low, high] of [
      [1, 36.5, 48.5],
      [2, 40.5, 49.5],
    ] as const) {
      expect(Math.min(...rim.map((c) => c.origin[axis] ?? 0))).toBeCloseTo(
        low,
        4,
      );
      expect(Math.max(...rim.map((c) => end(c, axis)))).toBeCloseTo(high, 4);
    }
    for (const [y, z] of [
      [36.6, 40.6],
      [36.6, 49.4],
      [48.4, 40.6],
      [48.4, 49.4],
    ] as const)
      expect(cubes.filter((c) => covers(c, y, z))).toEqual([]);
    for (const c of cubes.filter((c) => c.uv.north?.uv[0] === TRIM_BEIGE_SLOT))
      expect(c.origin[0]).toBeCloseTo(-24.3, 4);
  });
  it("cuts two columns of twelve recessed slits above a plain lower part", () => {
    const slits = lid().filter((c) => c.uv.north?.uv[0] === BLACK_SLOT);
    expect(slits).toHaveLength(24);
    for (const c of slits) {
      expect(c.origin[0]).toBeCloseTo(-24.2, 4);
      expect(c.size[0]).toBeCloseTo(0.1, 4);
      expect(c.origin[1]).toBeGreaterThan(40);
    }
    const left = slits.filter((c) => end(c, 2) < 45);
    const right = slits.filter((c) => (c.origin[2] ?? 0) > 45);
    expect(left).toHaveLength(12);
    expect(right).toHaveLength(12);
    const panel = lid().filter((c) => c.uv.north?.uv[0] === TRIM_BEIGE_SLOT);
    for (const c of slits)
      expect(
        panel.some((p) =>
          covers(p, (c.origin[1] ?? 0) + 0.1, (c.origin[2] ?? 0) + 0.1),
        ),
      ).toBe(false);
  });
  it("adds a latch below the slits", () => {
    const steel = lid().filter((c) => c.uv.north?.uv[0] === STEEL_SLOT);
    const latch = steel.filter((c) => (c.size[2] ?? 0) > 1);
    expect(latch).toHaveLength(1);
    expect(end(latch[0] as Cube, 1)).toBeLessThan(40);
  });
});

const { width, height, regions, period, texelsPerPx, slots, windows } =
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import contextlib, io, json, runpy, sys",
          "sys.argv = ['tools/gen_camper.py', 'packs/yasu_ride_rp', '--check']",
          "with contextlib.redirect_stdout(io.StringIO()):",
          "    camper = runpy.run_path('tools/gen_camper.py')",
          "atlas = camper['ATLAS']",
          "print(json.dumps(dict(width=atlas.width, height=atlas.height, regions=atlas.regions, period=camper['RIB_PERIOD_TEXELS'], texelsPerPx=camper['RIB_TEXELS_PER_PX'], slots=camper['SLOTS'], windows=[camper['right_windows'], camper['left_windows']])))",
        ].join("\n"),
      ],
      { encoding: "utf8" },
    ),
  ) as {
    width: number;
    height: number;
    regions: [[string, number, number, number, number]];
    period: number;
    texelsPerPx: number;
    slots: string[];
    windows: number[][][];
  };

describe("camper rib atlas (ADR 0190)", () => {
  it("preserves every cube's bone, origin, and size from the pre-rib geometry", () => {
    const fixture = JSON.parse(
      readFileSync("tests/packs/fixtures/camper-cubes.json", "utf8"),
    );
    const isAddedRoofRail = (b: Bone, c: Cube) =>
      b.name === "body" && isRoofRail(c);
    expect(
      bones.flatMap((b) =>
        (b.cubes ?? []).filter((c) => isAddedRoofRail(b, c)),
      ),
    ).toHaveLength(20);
    expect(
      bones.flatMap((b) =>
        (b.cubes ?? [])
          .filter((c) => !isAddedRoofRail(b, c))
          .map((c) => [b.name, c.origin, c.size]),
      ),
    ).toEqual(fixture);
  });

  it("allocates the rib region below the swatches with groove, highlight, and flat bands", () => {
    expect([width, height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    expect(regions.find(([name]) => name === "bolt")?.[4]).toBe(1);
    expect(period / texelsPerPx).toBe(2);
    expect(texelsPerPx).toBe(2);
    expect(regions[0]).toEqual(["rib", 0, 1, 8, 64 * texelsPerPx]);
    expect(regions.map(([name]) => name)).toEqual([
      "rib",
      "door_head",
      "door_hinge",
      "door_latch",
      "vent_screws",
      "bolt",
    ]);
    for (const [i, [, x, y, w, h]] of regions.entries()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(width);
      expect(y + h).toBeLessThanOrEqual(height);
      for (const [, ox, oy, ow, oh] of regions.slice(0, i))
        expect(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y).toBe(
          true,
        );
    }
    const [, x, y, w, h] = defined(regions[0], "rib region");
    expect(h % period).toBe(0);
    const texture = readPng("textures/entity/yasu_ride/camper");
    const shell = [...texture.pixels.subarray(0, 3)];
    for (let dy = 0; dy < h; dy++) {
      const phase = dy % period;
      const factor = phase === 0 ? 0.93 : phase === 1 ? 1.05 : 1;
      const expected = [
        ...shell.map((c) => Math.min(255, Math.floor(c * factor + 0.5))),
        255,
      ];
      for (let dx = 0; dx < w; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
          expected,
        );
      }
    }
  });

  it("maps only the outward white shell faces on both walls and the door to height-aligned ribs", () => {
    const [, x, y, w, h] = defined(regions[0], "rib region");
    const roofHeight = h / texelsPerPx;
    const sampledRow = (cube: Cube, v: number, worldY: number) =>
      Math.floor(v + (end(cube, 1) - worldY) * texelsPerPx);
    const entries = bones.flatMap((b) =>
      (b.cubes ?? []).flatMap((c) =>
        Object.entries(c.uv)
          .filter(([, f]) => {
            const [u = 0, v = 0] = f.uv;
            return u >= x && u < x + w && v >= y && v < y + h;
          })
          .map(([side, face]) => ({ bone: b.name, cube: c, side, face })),
      ),
    );
    expect(
      entries.filter((e) => e.bone === "body" && e.side === "west"),
    ).toHaveLength(256);
    expect(
      entries.filter((e) => e.bone === "body" && e.side === "east"),
    ).toHaveLength(223);
    const roof = (bone("body").cubes ?? []).find(
      (c) => c.origin[1] === 61 && c.size[1] === 3 && c.size[0] === 48,
    );
    expect(roof).toBeDefined();
    for (const face of Object.values(roof?.uv ?? {}))
      expect(face.uv[1]).toBe(0);
    expect(new Set(entries.map((e) => e.bone))).toEqual(
      new Set(["body", "door_entry"]),
    );
    expect(
      entries.filter((e) => e.bone === "door_entry").map((e) => e.side),
    ).toEqual(["west"]);
    fc.assert(
      fc.property(
        fc.shuffledSubarray(entries, {
          minLength: entries.length,
          maxLength: entries.length,
        }),
        (faces) => {
          for (const { cube, side, face } of faces) {
            const [u = 0, v = 0] = face.uv;
            const [du = 0, dv = 0] = face.uv_size;
            const y0 = cube.origin[1] ?? 0;
            const height = cube.size[1] ?? 0;
            expect(u).toBeGreaterThanOrEqual(x);
            expect(v).toBeGreaterThanOrEqual(y);
            expect(du).toBeGreaterThan(0);
            expect(dv).toBeGreaterThan(0);
            expect(u + du).toBeLessThanOrEqual(x + w);
            expect(v + dv).toBeLessThanOrEqual(y + h);
            expect(v - y).toBeCloseTo(
              (roofHeight - (y0 + height)) * texelsPerPx,
              8,
            );
            expect(dv).toBeCloseTo(height * texelsPerPx, 8);
            const worldHeights = [0.137, 0.513, 0.879].map(
              (fraction) => y0 + fraction * height,
            );
            for (
              let step = Math.floor(y0 * texelsPerPx);
              step < (y0 + height) * texelsPerPx;
              step++
            ) {
              const worldY = (step + 0.5) / texelsPerPx;
              if (worldY > y0 && worldY < y0 + height)
                worldHeights.push(worldY);
            }
            for (const worldY of worldHeights)
              expect(sampledRow(cube, v, worldY)).toBe(
                Math.floor(y + (roofHeight - worldY) * texelsPerPx),
              );
            const edge =
              side === "west"
                ? (cube.origin[0] ?? 0)
                : (cube.origin[0] ?? 0) + (cube.size[0] ?? 0);
            expect(edge).toBe(side === "west" ? -24 : 24);
            expect(cube.rotation).toBeUndefined();
            for (const [other, f] of Object.entries(cube.uv)) {
              if (f.uv[1] === 0)
                expect(f).toEqual({ uv: [0, 0], uv_size: [1, 1] });
              else expect(["east", "west"]).toContain(other);
            }
          }
        },
      ),
      { numRuns: 10 },
    );
    const overlaps = entries.flatMap((a, i) =>
      entries.slice(i + 1).flatMap((b) => {
        const plane = (entry: typeof a) =>
          entry.side === "west"
            ? (entry.cube.origin[0] ?? 0)
            : end(entry.cube, 0);
        if (a.side !== b.side || plane(a) !== plane(b)) return [];
        const bottom = Math.max(a.cube.origin[1] ?? 0, b.cube.origin[1] ?? 0);
        const top = Math.min(end(a.cube, 1), end(b.cube, 1));
        const front = Math.max(a.cube.origin[2] ?? 0, b.cube.origin[2] ?? 0);
        const rear = Math.min(end(a.cube, 2), end(b.cube, 2));
        return bottom < top && front < rear ? [{ a, b, bottom, top }] : [];
      }),
    );
    expect(overlaps.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        (fraction) => {
          for (const { a, b, bottom, top } of overlaps) {
            const worldY = bottom + fraction * (top - bottom);
            expect(sampledRow(a.cube, a.face.uv[1] ?? 0, worldY) % 2).toBe(
              sampledRow(b.cube, b.face.uv[1] ?? 0, worldY) % 2,
            );
          }
        },
      ),
      { numRuns: 10 },
    );
  });
  const required = <T>(value: T | undefined): T =>
    defined(value, "camper trim");
  const regionFace = (name: string) => {
    const [, x, y, w, h] = required(regions.find(([n]) => n === name));
    return { uv: [x, y], uv_size: [w, h] };
  };

  it("uses aluminium door frames with head, hinge, and latch hardware on the outward face", () => {
    const frames = (bone("door_entry").cubes ?? []).filter(
      (c) => c.size[0] === 0.18,
    );
    expect(frames).toHaveLength(4);
    for (const c of frames)
      expect(c.uv.north?.uv).toEqual([slots.indexOf("aluminium"), 0]);
    for (const [name, y, z] of [
      ["door_head", 49, -4.6],
      ["door_hinge", 36, -4.6],
      ["door_latch", 36, 4],
    ] as const) {
      const frame = required(
        frames.find((c) => c.origin[1] === y && c.origin[2] === z),
      );
      expect(frame.uv.west).toEqual(regionFace(name));
    }
  });

  it("uses beige side window frames, black cab frames, and aluminium mullions", () => {
    for (const [side, sideWindows] of windows.entries()) {
      for (const [index, window] of sideWindows.entries()) {
        const [z0, z1, y0, y1] = window;
        const frames = (bone("body").cubes ?? []).filter(
          (c) =>
            c.size[0] === 0.15 &&
            Math.abs((c.origin[0] ?? 0) - (side === 0 ? -24.15 : 24)) < 1e-6 &&
            (c.origin[2] ?? 0) >= required(z0) - 0.601 &&
            (c.origin[2] ?? 0) + (c.size[2] ?? 0) <= required(z1) + 0.601 &&
            (c.origin[1] ?? 0) >= required(y0) - 0.601 &&
            (c.origin[1] ?? 0) + (c.size[1] ?? 0) <= required(y1) + 0.601,
        );
        expect(frames).toHaveLength(4);
        for (const c of frames)
          for (const face of Object.values(c.uv))
            expect(face.uv).toEqual([
              slots.indexOf(index === 0 ? "black" : "trim_beige"),
              0,
            ]);
      }
    }
    for (const z of [-22.8, -17.3]) {
      const mullion = required(
        (bone("body").cubes ?? []).find(
          (c) => c.origin[2] === z && c.size[0] === 0.2 && c.size[1] === 13,
        ),
      );
      expect(mullion.uv.north?.uv).toEqual([slots.indexOf("aluminium"), 0]);
    }
  });

  it("puts a screw row on the aluminium vent upper rail", () => {
    const rail = required(
      (bone("body").cubes ?? []).find(
        (c) =>
          c.origin[0] === -24.5 && c.origin[1] === 47.8 && c.origin[2] === 41.2,
      ),
    );
    expect(rail.uv.north?.uv).toEqual([slots.indexOf("aluminium"), 0]);
    expect(rail.uv.west).toEqual(regionFace("vent_screws"));
  });

  it("paints the exact dark hardware pattern over aluminium in each region", () => {
    const texture = readPng("textures/entity/yasu_ride/camper");
    const aluminiumOffset = slots.indexOf("aluminium") * 4;
    const aluminium = [
      ...texture.pixels.subarray(aluminiumOffset, aluminiumOffset + 3),
    ];
    const light = [...aluminium, 255];
    const dark = [...aluminium.map((c) => Math.floor(c * 0.65 + 0.5)), 255];
    const patterns: Record<
      string,
      (dx: number, dy: number, h: number) => boolean
    > = {
      door_head: (_dx, dy, h) => dy === h - 1,
      door_hinge: (_dx, dy) => [5, 6, 19, 20].includes(dy),
      door_latch: (dx, dy) => dx === 1 && [10, 11].includes(dy),
      vent_screws: (dx, dy) => dy === 1 && [2, 7, 12].includes(dx),
    };
    for (const [name, isDark] of Object.entries(patterns)) {
      const [, x, y, w, h] = required(regions.find(([n]) => n === name));
      let darkCount = 0;
      let lightCount = 0;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const hardware = isDark(dx, dy, h);
          const offset = ((y + dy) * width + x + dx) * 4;
          expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
            hardware ? dark : light,
          );
          if (hardware) darkCount++;
          else lightCount++;
        }
      }
      expect(darkCount).toBeGreaterThan(0);
      expect(lightCount).toBeGreaterThan(0);
    }
  });

  it("preserves hardware pixels in lit textures and keeps their MER non-emissive", () => {
    const base = readPng("textures/entity/yasu_ride/camper");
    const lit = readPng("textures/entity/yasu_ride/camper_lit");
    const mer = readPng("textures/entity/yasu_ride/camper_lit_mer");
    for (const [, x, y, w, h] of regions)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const offset = ((y + dy) * width + x + dx) * 4;
          expect(lit.pixels.subarray(offset, offset + 4)).toEqual(
            base.pixels.subarray(offset, offset + 4),
          );
          expect([...mer.pixels.subarray(offset, offset + 4)]).toEqual([
            0, 0, 255, 255,
          ]);
        }
  });
});

describe("camper aluminium roof edges", () => {
  it("maps bolts only to the three outer edge faces and preserves lamp swatches and bezels", () => {
    const [, boltX, boltY, boltWidth, boltHeight] = defined(
      regions.find(([name]) => name === "bolt"),
      "bolt region",
    );
    expect(boltX).toBe(0);
    expect(boltHeight).toBe(1);
    const cubes = bones.flatMap((b) => b.cubes ?? []);
    const edges = cubes.filter((c) =>
      Object.values(c.uv).some((f) => f.uv[1] === boltY),
    );
    expect(edges).toHaveLength(3);
    const front = defined(
      edges.find((c) => c.size[0] === 48.4),
      "front roof edge",
    );
    expect(front.origin[0]).toBe(-24.2);
    expect(front.origin[1]).toBe(63.4);
    expect(front.size).toEqual([48.4, 0.7, 1]);
    function edgeWidth(c: Cube): number {
      return defined(c.size[c === front ? 0 : 2], "edge width");
    }
    function outerFace(c: Cube): string {
      if (c === front) return "north";
      return defined(c.origin[0], "edge x") < 0 ? "west" : "east";
    }
    for (const c of edges) {
      const outer = outerFace(c);
      const width = edgeWidth(c);
      if (c !== front) {
        expect(c.origin[1]).toBe(63.4);
        expect(c.size.slice(0, 2)).toEqual([0.4, 0.6]);
        expect(c.origin[0]).toBe(outer === "west" ? -24.4 : 24);
      }
      for (const [face, uv] of Object.entries(c.uv))
        expect(uv).toEqual(
          face === outer
            ? { uv: [0, boltY], uv_size: [width, 1] }
            : { uv: [ALUMINIUM_SLOT, 0], uv_size: [1, 1] },
        );
    }
    for (const [name, slots] of [
      ["headlights", [14, 34, 35]],
      ["ceiling_lights", [10, 33]],
    ] as const) {
      const lamps = bone(name).cubes ?? [];
      expect(lamps.length).toBeGreaterThan(0);
      for (const c of lamps)
        for (const face of Object.values(c.uv)) {
          expect(slots as readonly number[]).toContain(face.uv[0]);
          expect(face.uv[1]).toBe(0);
          expect(face.uv_size).toEqual([1, 1]);
        }
    }
    const bezels = cubes.filter(
      (c) => c.origin[1] === 63.9 && c.size[1] === 0.2 && c.size[2] === 1.2,
    );
    expect(bezels).toHaveLength(5);
    for (const c of bezels)
      for (const face of Object.values(c.uv))
        expect(face).toEqual({ uv: [10, 0], uv_size: [1, 1] });
    const texture = readPng("textures/entity/yasu_ride/camper");
    expect(texture.height).toBeGreaterThanOrEqual(boltY + boltHeight);
    expect(boltWidth).toBe(texture.width);
    expect(texture.width).toBe(Math.ceil(Math.max(...edges.map(edgeWidth))));
    for (let x = 0; x < texture.width; x++) {
      const offset = (boltY * texture.width + x) * 4;
      expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
        x % 6 === 0 ? [109, 111, 109, 255] : [168, 170, 168, 255],
      );
    }
  });
});

describe("camper aluminium roof rails", () => {
  const body = bone("body").cubes ?? [];
  const rails = body.filter(isRoofRail);

  it("keeps mirrored rails and posts inside the footprint and at most 3 px above the roof", () => {
    expect(rails.length).toBeGreaterThan(0);
    expect(rails.some((cube) => cube.origin[1] === ROOF)).toBe(true);
    expect(rails.some((cube) => (cube.size[2] ?? 0) > 80)).toBe(true);
    for (const cube of rails) {
      expect(cube.origin[0]).toBeGreaterThanOrEqual(-24);
      expect(end(cube, 0)).toBeLessThanOrEqual(24);
      expect(cube.origin[2]).toBeGreaterThanOrEqual(-56);
      expect(end(cube, 2)).toBeLessThanOrEqual(56);
      expect(end(cube, 1)).toBeLessThanOrEqual(ROOF + 3);
      expect(cube.rotation ?? [0, 0, 0]).toEqual([0, 0, 0]);
      expect(
        rails.some(
          (other) =>
            Math.abs((other.origin[0] ?? 0) + end(cube, 0)) < 1e-6 &&
            other.origin[1] === cube.origin[1] &&
            other.origin[2] === cube.origin[2] &&
            other.size.every((size, axis) => size === cube.size[axis]),
        ),
      ).toBe(true);
    }
  });

  it("supports each rail's front and rear end with a post underneath", () => {
    const posts = rails.filter((cube) => cube.origin[1] === ROOF);
    const ends = rails.filter(
      (cube) => (cube.origin[1] ?? 0) > ROOF && (cube.size[2] ?? 0) < 1,
    );
    expect(ends).toHaveLength(4);
    for (const railEnd of ends) {
      expect(
        posts.some(
          (post) =>
            (post.origin[0] ?? 0) >= (railEnd.origin[0] ?? 0) &&
            end(post, 0) <= end(railEnd, 0) &&
            Math.abs(end(post, 1) - (railEnd.origin[1] ?? 0)) < 1e-6 &&
            Math.abs((post.origin[2] ?? 0) - (railEnd.origin[2] ?? 0)) < 1e-6 &&
            Math.abs(end(post, 2) - end(railEnd, 2)) < 1e-6,
        ),
      ).toBe(true);
    }
  });

  it("clears the existing roof equipment, including the AC units, fan, rack and ladder", () => {
    // Include every existing body cube reaching above the roof, so equipment changes
    // cannot silently drop out of the clearance check through a coordinate filter.
    const equipment = body.filter(
      (cube) => !rails.includes(cube) && end(cube, 1) > ROOF,
    );
    expect(equipment.length).toBeGreaterThan(0);
    for (const rail of rails) {
      const overlaps = equipment.filter((cube) =>
        [0, 1, 2].every(
          (axis) =>
            (rail.origin[axis] ?? 0) < end(cube, axis) - 1e-6 &&
            (cube.origin[axis] ?? 0) < end(rail, axis) - 1e-6,
        ),
      );
      expect(overlaps).toEqual([]);
    }
  });
});
