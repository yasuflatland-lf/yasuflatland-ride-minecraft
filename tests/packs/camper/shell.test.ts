import { describe, expect, it } from "vitest";
import { assertOneAxis, multipleAxes } from "../oneAxis";
import {
  bone,
  bones,
  type Cube,
  cubeCenter,
  geometry,
  geometryText,
  paletteSlots,
  swatch,
} from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("allows compound rotations only in declared assemblies (ADR 0167)", () => {
    const cubes = bones.flatMap((bone) => bone.cubes ?? []);
    const compound = cubes.filter(multipleAxes);
    const assemblies = {
      slanted: compound.filter((cube) => cube.rotation?.[0] === 45),
      front_panels: compound.filter((cube) => cube.rotation?.[0] !== 45),
    };
    expect(assemblies.slanted).toHaveLength(0);
    expect(assemblies.front_panels).toHaveLength(518);
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
        "glow_fl",
        "glow_fr",
        "glow_rl",
        "glow_rr",
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
        "drawer_top",
        "drawer_bottom",
        "cabinet_sink_door",
        "cabinet_stove_door",
        "fridge_top_door",
        "fridge_bottom_door",
        "mirror",
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

  it("draws the side stripe's W as mirrored single-cube strokes on a flat bottom (#459)", () => {
    const strokes = (bone("body").cubes ?? []).filter(
      (cube) => swatch(cube, "stripe") && (cube.rotation?.[0] ?? 0) !== 0,
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
    const cubes = (bone("body").cubes ?? []).filter((cube) =>
      swatch(cube, "stripe"),
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

  it("keeps the wheel's spokes level (owner decision in #410)", () => {
    expect(paletteSlots.indexOf("ivory")).toBeGreaterThanOrEqual(0);
    const spokes = (bone("steering").cubes ?? []).filter(
      (cube) => swatch(cube, "ivory") && Math.max(...cube.size) >= 3,
    );
    expect(spokes.length).toBeGreaterThan(0);
    for (const cube of spokes) {
      const z = cube.rotation?.[2] ?? 0;
      expect([0, 180, -180]).toContain(z);
      expect(cube.rotation?.[0] ?? 0).toBe(0);
      expect(cube.rotation?.[1] ?? 0).toBe(0);
    }
  });
});
