import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Vec = [number, number, number];
type Cube = { origin: Vec; size: Vec; pivot?: Vec; rotation?: Vec };
type Cubes = Record<string, Cube[]>;
type Result = {
  measures: Record<string, number>;
  targets: Record<string, { ratio: number; tolerance: number }>;
  repeated: Record<string, number>;
  bounds: [Vec, Vec];
  unchanged: boolean;
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
    "print(json.dumps(dict(measures=first, targets=m.TARGETS, repeated=m.measure(cubes), bounds=m._bounds([c for members in cubes.values() for c in members]), unchanged=cubes == before)))",
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
) as {
  "minecraft:geometry": [
    {
      description: {
        visible_bounds_width: number;
        visible_bounds_height: number;
        visible_bounds_offset: Vec;
      };
      bones: { name: string; cubes?: Cube[] }[];
    },
  ];
};
const generated: Cubes = Object.fromEntries(
  model["minecraft:geometry"][0].bones.map((b) => [b.name, b.cubes ?? []]),
);
const keys = [
  "greenhouse_length",
  "greenhouse_height",
  "greenhouse_rear_gap",
  "windshield_front_gap",
  "belt_height",
  "wheel_diameter",
];

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

const fixture = (angle: number): Cubes => ({
  body: [
    { origin: [-10, 5, -30], size: [20, 10, 65] },
    { origin: [-10, 29, -5], size: [20, 1, 35] },
    {
      origin: [-9, 17, -10.5],
      size: [18, 1, 0.5],
      pivot: [0, 17, -10],
      rotation: [-angle, 0, 0],
    },
  ],
  ...Object.fromEntries(
    ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].map((name) => [
      name,
      [{ origin: [10, 0, 0], size: [4, 12, 12] }],
    ]),
  ),
});

describe("SUV proportions", () => {
  it("measures every ratio on the generated SUV without changing its cubes", () => {
    const result = run(generated);
    expect(Object.keys(result.measures).sort()).toEqual([...keys].sort());
    expect(Object.keys(result.targets).sort()).toEqual([...keys].sort());
    for (const value of Object.values(result.measures)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(result.repeated).toEqual(result.measures);
    expect(result.unchanged).toBe(true);
  });

  it.each(
    keys.filter(
      (key) => key.startsWith("greenhouse_") || key === "windshield_front_gap",
    ),
  )("matches the %s target within its tolerance", (key) => {
    const { measures, targets } = run(generated);
    const target = targets[key];
    if (!target) throw new Error(`Missing target: ${key}`);
    expect(
      Math.abs((measures[key] ?? Number.NaN) - target.ratio),
    ).toBeLessThanOrEqual(target.tolerance);
  });

  it("keeps every rotated cube inside the declared visible bounds", () => {
    const { bounds } = run(generated);
    const description = model["minecraft:geometry"][0].description;
    const half = [
      description.visible_bounds_width * 8,
      description.visible_bounds_height * 8,
      description.visible_bounds_width * 8,
    ];
    for (const axis of [0, 1, 2] as const) {
      const center = description.visible_bounds_offset[axis] * 16;
      expect(bounds[0][axis]).toBeGreaterThanOrEqual(
        center - (half[axis] ?? 0),
      );
      expect(bounds[1][axis]).toBeLessThanOrEqual(center + (half[axis] ?? 0));
    }
  });

  it("preserves belt height and road wheel diameter for the lower-body follow-up", () => {
    const { measures } = run(generated);
    expect(measures.belt_height).toBeCloseTo(0.26173564808417604, 10);
    expect(measures.wheel_diameter).toBeCloseTo(0.18526991261723763, 10);
  });

  it("preserves all ratios under uniform scaling and reversed cube order", () => {
    const baseline = run(generated).measures;
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (factor) => {
        const cubes = scale(generated, [factor, factor, factor]);
        for (const members of Object.values(cubes)) members.reverse();
        const result = run(cubes);
        for (const key of keys)
          expect(result.measures[key]).toBeCloseTo(
            baseline[key] ?? Number.NaN,
            10,
          );
        expect(result.repeated).toEqual(result.measures);
        expect(result.unchanged).toBe(true);
      }),
      { numRuns: 20 },
    );
  }, 60_000);

  it("reduces height ratios when fixture cubes stretch in z", () => {
    const cubes = fixture(25);
    const baseline = run(cubes).measures;
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (factor) => {
        const result = run(scale(cubes, [1, 1, factor]));
        for (const key of [
          "greenhouse_height",
          "belt_height",
          "wheel_diameter",
        ]) {
          expect(result.measures[key]).toBeCloseTo(
            (baseline[key] ?? Number.NaN) / factor,
            10,
          );
          expect(result.measures[key]).toBeLessThan(
            baseline[key] ?? Number.NaN,
          );
        }
        expect(result.repeated).toEqual(result.measures);
        expect(result.unchanged).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("measures the windshield foot after rotation about its offset pivot", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), (angle) => {
        const result = run(fixture(angle)).measures;
        const foot = -10 - 0.5 * Math.cos((angle * Math.PI) / 180);
        expect(result.windshield_front_gap).toBeCloseTo((foot + 30) / 65, 10);
        expect(result.greenhouse_length).toBeCloseTo((30 - foot) / 65, 10);
        expect(result.greenhouse_rear_gap).toBeCloseTo(5 / 65, 10);
        expect(result.greenhouse_height).toBeCloseTo(13 / 65, 10);
        expect(result.belt_height).toBeCloseTo(17 / 65, 10);
        expect(result.wheel_diameter).toBeCloseTo(12 / 65, 10);
      }),
      { numRuns: 20 },
    );
  });
});
