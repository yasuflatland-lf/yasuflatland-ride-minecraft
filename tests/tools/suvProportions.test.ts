import { readFileSync } from "node:fs";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";

import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import { type Bone, turnedCorners } from "../support/geometry";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

type Measurement =
  | { pixels: number; ratio: number }
  | { degrees: number }
  | null;
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
  extents: { front: number; halfWidth: number; roofTop: number };
};

const run = async (cubes: Cubes): Promise<Result> => {
  const script = [
    "import copy, json, sys",
    "sys.path.insert(0, 'tools')",
    "from tool_loader import load_tool",
    "m = load_tool('suv_proportions')",
    "d = load_tool('suv_dims')",
    "D, scale = d.DIMS, d.SIZE_SCALE / 16",
    "extents = dict(front=(D.front_bumper.tip_z + 0.05) * scale, halfWidth=max(D.wheels.bumper_half_width, D.flare.x) * scale, roofTop=(D.greenhouse.roof_top + 0.3) * scale)",
    "cubes = json.load(sys.stdin)",
    "before = copy.deepcopy(cubes)",
    "first = m.measure(cubes)",
    "print(json.dumps(dict(measures=first, targets=m.TARGETS, repeated=m.measure(cubes), unchanged=cubes == before, pending=sorted(m.PENDING), bounds=m._bounds(cubes['body']), extents=extents)))",
  ].join("\n");
  return JSON.parse(await python.run(script, JSON.stringify(cubes)));
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
  "overall_length",
  "overall_width",
  "track_width",
  "tyre_width",
  "flare_reach",
  "flare_top_height",
  "hood_scoop_height",
  "hood_scoop_length",
  "front_bumper_reach",
  "step_height",
  "step_reach",
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

const baseline = await run(generated);

describe("SUV proportions", () => {
  it("preserves the completed proportions of non-pending rows within 0.005", () => {
    const previous = {
      overall_length: 4.976228378189183,
      overall_width: 2.2339877064968126,
      flare_reach: 0.2532960038964787,
      flare_top_height: 1.4467457194819207,
      track_width: 1.873559950132643,
      tyre_width: 0.4318489246759638,
      wheelbase: 3.1624628945501345,
      front_overhang: 0.863697849351928,
      rear_overhang: 0.9500676342871203,
      ground_clearance: 0.5913526571429923,
      overall_height: 2.136043041560863,
      belt_height: 1.5297935896119137,
      side_window_height: 0.5398111558449548,
      hood_height: 1.5796223116899095,
      hood_length: 1.7408615361830717,
      hood_scoop_height: 0.06676667923395445,
      hood_scoop_length: 0.2218978948443212,
      front_bumper_length: 0.290667545454976,
      rear_bumper_length: 0.4152393506499652,
      bumper_height: 0.34880105454597077,
    };
    for (const [key, ratio] of Object.entries(previous)) {
      if (baseline.pending.includes(key)) continue;
      expect(Math.abs(linear(baseline, key).ratio - ratio)).toBeLessThanOrEqual(
        0.005,
      );
    }
  });

  it("reports every row deterministically without mutating cubes", () => {
    expect(Object.keys(baseline.measures).sort()).toEqual([...keys].sort());
    expect(Object.keys(baseline.targets).sort()).toEqual([...keys].sort());
    expect(baseline.pending.every((key) => keys.includes(key))).toBe(true);
    for (const [key, row] of Object.entries(baseline.measures)) {
      if (baseline.pending.includes(key) && row === null) continue;
      expect(row).not.toBeNull();
      if (row === null) throw new Error(`Missing completed measure ${key}`);
      for (const value of Object.values(row)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
    expect(baseline.repeated).toEqual(baseline.measures);
    expect(baseline.unchanged).toBe(true);
  });

  it("keeps every row without a landmark in PENDING", () => {
    for (const [key, row] of Object.entries(baseline.measures)) {
      if (row === null) expect(baseline.pending).toContain(key);
    }
  });

  it("preserves ratios and rake under uniform scaling and reversed cube order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.25, max: 20, noNaN: true }),
        async (factor) => {
          const cubes = scale(generated, [factor, factor, factor]);
          for (const members of Object.values(cubes)) members.reverse();
          const result = await run(cubes);
          for (const key of keys) {
            if (baseline.measures[key] === null) {
              expect(result.measures[key]).toBeNull();
            } else if (key === "windshield_rake") {
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
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);

  it("measures wheelbase from the wheel bones when the rear axle moves", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        async (shift) => {
          const cubes = structuredClone(generated);
          for (const name of ["wheel_rl", "wheel_rr"]) {
            for (const cube of cubes[name] ?? []) {
              cube.origin[2] += shift;
              if (cube.pivot) cube.pivot[2] += shift;
            }
          }
          expect(linear(await run(cubes), "wheelbase").pixels).toBeCloseTo(
            linear(baseline, "wheelbase").pixels + shift,
            10,
          );
        },
      ),
      { numRuns: 10 },
    );
  }, 60_000);

  it("ignores an enlarged rear spare when measuring the bumper tip", async () => {
    const cubes = structuredClone(generated);
    cubes.body?.push({
      origin: [-3, 12, 50],
      size: [6, 6, 3],
      pivot: [0, 15, 51.5],
      rotation: [0, 0, 45],
    });
    const result = await run(cubes);
    expect(linear(result, "rear_overhang")).toEqual(
      linear(baseline, "rear_overhang"),
    );
    for (const key of ["hood_scoop_height", "hood_scoop_length"]) {
      expect(linear(result, key)).toEqual(linear(baseline, key));
    }
  });

  it("turns corners around offset pivots in the game rotation convention", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 80 }), async (angle) => {
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
        const result = await run(cubes);
        for (const key of ["hood_scoop_height", "hood_scoop_length"]) {
          expect(linear(result, key)).toEqual(linear(baseline, key));
        }
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
    expect(Math.max(...points.map((p) => -p[2])) / 16).toBeCloseTo(
      baseline.extents.front,
      10,
    );
    expect(Math.max(...points.map((p) => Math.abs(p[0]))) / 16).toBeCloseTo(
      baseline.extents.halfWidth,
      10,
    );
    expect(baseline.bounds[1][1] / 16).toBeCloseTo(
      baseline.extents.roofTop,
      10,
    );
    expect(Math.max(...points.map((p) => -p[2])) / 16).toBeLessThanOrEqual(
      SUV_SPEC.bodyFront,
    );
    expect(
      Math.max(...points.map((p) => Math.abs(p[0]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.bodyHalfWidth);
    // Keep the measured pre-growth roof-to-box gap below 0.075 blocks (ADR 0194).
    const heightMargin = 0.075;
    expect(linear(baseline, "overall_height").pixels / 16).toBeLessThanOrEqual(
      SUV_SPEC.carHeight + heightMargin,
    );
    const lamps = cornersOf((name) => name === "headlights");
    const wheels = cornersOf((name) => name.startsWith("wheel_"));
    // The enclosing probes include lamps and wheel hubs after scaling (ADR 0194).
    expect(Math.max(...lamps.map((p) => -p[2])) / 16).toBeLessThanOrEqual(
      SUV_SPEC.bodyFront,
    );
    expect(
      Math.max(...wheels.map((p) => Math.abs(p[0]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.bodyHalfWidth);
    const all = cornersOf(() => true);
    expect(
      Math.max(...all.map((p) => Math.hypot(p[0], p[2]))) / 16,
    ).toBeLessThanOrEqual(SUV_SPEC.footprint);
    const roundUp = (value: number) => Math.ceil(value * 100) / 100;
    expect(SUV_SPEC.bodyFront).toBe(
      roundUp(Math.max(...points.concat(lamps).map((p) => -p[2])) / 16),
    );
    expect(SUV_SPEC.bodyHalfWidth).toBe(
      roundUp(
        Math.max(...points.concat(wheels).map((p) => Math.abs(p[0]))) / 16,
      ),
    );
    expect(SUV_SPEC.footprint).toBe(
      roundUp(Math.max(...all.map((p) => Math.hypot(p[0], p[2]))) / 16),
    );
  });
});
