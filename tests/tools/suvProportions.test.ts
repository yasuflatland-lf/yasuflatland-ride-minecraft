import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import { type Bone, turnedCorners } from "../support/geometry";

type Measurement = { pixels: number; ratio: number } | { degrees: number };
type Vec = [number, number, number];
type Cube = { origin: Vec; size: Vec; pivot?: Vec; rotation?: Vec };
type Cubes = Record<string, Cube[]>;
type Result = {
  measures: Record<string, Measurement>;
  targets: Record<
    string,
    { ratio?: number; degrees?: number; tolerance: number }
  >;
  repeated: Record<string, Measurement>;
  unchanged: boolean;
  pending: string[];
  bounds: [Vec, Vec];
};

const run = (cubes: Cubes): Result => {
  const script = [
    "import copy, json, sys",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    "m = load_tool('suv_proportions')",
    "cubes = json.load(sys.stdin)",
    "before = copy.deepcopy(cubes)",
    "first = m.measure(cubes)",
    "print(json.dumps(dict(measures=first, targets=m.TARGETS, repeated=m.measure(cubes), unchanged=cubes == before, pending=sorted(m.PENDING), bounds=m._bounds(cubes['body']))))",
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", script], {
      input: JSON.stringify(cubes),
      encoding: "utf8",
    }),
  );
};

const model = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
) as { "minecraft:geometry": [{ bones: { name: string; cubes?: Cube[] }[] }] };
const generated: Cubes = Object.fromEntries(
  model["minecraft:geometry"][0].bones.map((b) => [b.name, b.cubes ?? []]),
);
const keys = [
  "wheelbase",
  "front_overhang",
  "rear_overhang",
  "ground_clearance",
  "overall_height",
  "belt_height",
  "side_window_height",
  "hood_height",
  "hood_length",
  "windshield_rake",
  "front_bumper_length",
  "rear_bumper_length",
  "bumper_height",
];
const linear = (result: Result, key: string) => {
  const value = result.measures[key];
  if (!value || !("pixels" in value))
    throw new Error(`Missing linear measure ${key}`);
  return value;
};

const scale = (cubes: Cubes, factors: Vec): Cubes =>
  Object.fromEntries(
    Object.entries(cubes).map(([name, members]) => [
      name,
      members.map((cube) => {
        const result = structuredClone(cube);
        for (const key of ["origin", "size", "pivot"] as const) {
          const vector = result[key];
          if (vector)
            result[key] = vector.map((v, i) => v * (factors[i] ?? 1)) as Vec;
        }
        return result;
      }),
    ]),
  );

const baseline = run(generated);

describe("SUV proportions", () => {
  it("measures every row positively and deterministically without mutating cubes", () => {
    expect(Object.keys(baseline.measures).sort()).toEqual([...keys].sort());
    expect(Object.keys(baseline.targets).sort()).toEqual([...keys].sort());
    expect(baseline.pending.every((key) => keys.includes(key))).toBe(true);
    for (const row of Object.values(baseline.measures)) {
      for (const value of Object.values(row)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
    expect(baseline.repeated).toEqual(baseline.measures);
    expect(baseline.unchanged).toBe(true);
  });

  it("preserves ratios and rake under uniform scaling and reversed cube order", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.25, max: 20, noNaN: true }), (factor) => {
        const cubes = scale(generated, [factor, factor, factor]);
        for (const members of Object.values(cubes)) members.reverse();
        const result = run(cubes);
        for (const key of keys) {
          if (key === "windshield_rake") {
            expect(result.measures[key]).toEqual(baseline.measures[key]);
          } else {
            expect(linear(result, key).ratio).toBeCloseTo(
              linear(baseline, key).ratio,
              10,
            );
            expect(linear(result, key).pixels).toBeCloseTo(
              linear(baseline, key).pixels * factor,
              10,
            );
          }
        }
        expect(result.repeated).toEqual(result.measures);
        expect(result.unchanged).toBe(true);
      }),
      { numRuns: 20 },
    );
  }, 60_000);

  it("measures wheelbase from the wheel bones when the rear axle moves", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 2, noNaN: true }), (shift) => {
        const cubes = structuredClone(generated);
        for (const name of ["wheel_rl", "wheel_rr"]) {
          for (const cube of cubes[name] ?? []) {
            cube.origin[2] += shift;
            if (cube.pivot) cube.pivot[2] += shift;
          }
        }
        expect(linear(run(cubes), "wheelbase").pixels).toBeCloseTo(
          linear(baseline, "wheelbase").pixels + shift,
          10,
        );
      }),
      { numRuns: 10 },
    );
  }, 60_000);

  it("ignores an enlarged rear spare when measuring the bumper tip", () => {
    const cubes = structuredClone(generated);
    cubes.body?.push({
      origin: [-3, 12, 50],
      size: [6, 6, 3],
      pivot: [0, 15, 51.5],
      rotation: [0, 0, 45],
    });
    expect(linear(run(cubes), "rear_overhang")).toEqual(
      linear(baseline, "rear_overhang"),
    );
  });

  it("turns corners around offset pivots in the game rotation convention", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 80 }), (angle) => {
        const cubes = structuredClone(generated);
        cubes.body?.push({
          origin: [90, 90, 90],
          size: [2, 3, 4],
          pivot: [91, 91, 91],
          rotation: [angle, 23, -17],
        });
        const points = (cubes.body ?? []).flatMap((cube) =>
          turnedCorners({ name: "body" }, cube),
        );
        const result = run(cubes);
        for (const axis of [0, 1, 2] as const) {
          expect(result.bounds[0][axis]).toBeCloseTo(
            Math.min(...points.map((p) => p[axis])),
            10,
          );
          expect(result.bounds[1][axis]).toBeCloseTo(
            Math.max(...points.map((p) => p[axis])),
            10,
          );
        }
      }),
      { numRuns: 10 },
    );
  }, 60_000);

  for (const key of keys) {
    it.skipIf(baseline.pending.includes(key))(
      `${key} meets the reference tolerance`,
      () => {
        const target = baseline.targets[key];
        const measured = baseline.measures[key];
        if (!target || !measured) throw new Error(`Missing target ${key}`);
        const value = "degrees" in measured ? measured.degrees : measured.ratio;
        expect(
          Math.abs(value - (target.degrees ?? target.ratio ?? Number.NaN)),
        ).toBeLessThanOrEqual(target.tolerance);
      },
    );
  }

  it("keeps the body shell inside game probes and the complete model inside its footprint", () => {
    const bones = model["minecraft:geometry"][0].bones as Bone[];
    const cornersOf = (keep: (name: string) => boolean) =>
      bones
        .filter((bone) => keep(bone.name))
        .flatMap((bone) =>
          (bone.cubes ?? []).flatMap((cube) => turnedCorners(bone, cube)),
        );
    const points = cornersOf(
      (name) => name === "body" || name.startsWith("door_"),
    );
    expect(Math.max(...points.map((p) => -p[2])) / 16).toBeLessThanOrEqual(
      SUV_SPEC.bodyFront,
    );
    expect(
      Math.max(...points.map((p) => Math.abs(p[0]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.bodyHalfWidth);
    // ADR 0170 allows 0.30 blocks above the 1.6-block collision box for the roof.
    const heightMargin = 0.3;
    expect(linear(baseline, "overall_height").pixels / 16).toBeLessThanOrEqual(
      SUV_SPEC.carHeight + heightMargin,
    );
    const lamps = cornersOf((name) => name === "headlights");
    const wheels = cornersOf((name) => name.startsWith("wheel_"));
    // Bound main's existing decorative protrusions separately (ADR 0170).
    expect(Math.max(...lamps.map((p) => -p[2])) / 16).toBeLessThanOrEqual(
      SUV_SPEC.bodyFront + 0.00125 + 1e-12,
    );
    expect(
      Math.max(...wheels.map((p) => Math.abs(p[0]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.bodyHalfWidth + 0.025);
    const all = cornersOf(() => true);
    expect(
      Math.max(...all.map((p) => Math.hypot(p[0], p[2]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.footprint);
  });
});
