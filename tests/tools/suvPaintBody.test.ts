import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { expect, it } from "vitest";

type Rgba = [number, number, number, number];
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Missing painter data");
  return value;
};

type Sample = { kind: string | null; colors: Rgba[]; mers: Rgba[] };
type Region = {
  name: string;
  w: number;
  h: number;
  base: string;
  kinds: (string | null)[][];
  relief: (number | null)[][];
  samples: Sample[];
  recess: (string | number | null)[];
};
const data: {
  regions: Region[];
  paints: number[][];
  constants: Record<
    | "PAINT_METALNESS"
    | "PAINT_ROUGHNESS"
    | "FLAKE_METAL_JITTER"
    | "FLAKE_ROUGH_JITTER"
    | "FLAKE_COLOR_JITTER"
    | "HARDTOP_ROUGHNESS"
    | "HARDTOP_GRAIN"
    | "GROOVE_RELIEF"
    | "RECESS_RELIEF",
    number
  >;
  deterministic: boolean;
  density: number;
  atlasDensity: number;
} = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import sys, json, importlib.util
sys.path.insert(0, 'tools')
from tool_loader import load_tool
p = load_tool('suv_paint_body')
a = load_tool('suv_atlas')
m = load_tool('suv_material')
spec = importlib.util.spec_from_file_location('fresh_body', 'tools/suv_paint_body.py')
fresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fresh)
regions = []
deterministic = True
for s in p.REGIONS:
    points = [(i % s.w, (i // s.w) % s.h) for i in range(s.w * s.h)]
    samples = []
    for u, v in [(0, 0), (1, 1)] + [points[p.texel_hash(i, 7) % len(points)] for i in range(256)]:
        samples.append(dict(kind=p.detail(s.name, u, v),
            colors=[p.color(s.name, u, v, paint) for paint in p.palette.BODY_PAINTS],
            mers=[p.mer(s.name, u, v, paint).rgba() for paint in p.palette.BODY_PAINTS]))
    for u, v in reversed(points):
        for paint in p.palette.BODY_PAINTS:
            deterministic &= p.color(s.name, u, v, paint) == fresh.color(s.name, u, v, paint)
            deterministic &= p.mer(s.name, u, v, paint) == fresh.mer(s.name, u, v, paint)
    handle = []
    if s.name.startswith('door_'):
        x, y, rx, ry = p.recess(s.name)
        handle = [p.detail(s.name, int(x), int(y)), p.relief(s.name, int(x), int(y)),
                  p.detail(s.name, int(x), int(y + ry * 0.6))]
    regions.append(dict(name=s.name, w=s.w, h=s.h, base=s.base, samples=samples, recess=handle,
        kinds=[[p.detail(s.name, u, v) for u in range(s.w)] for v in range(s.h)],
        relief=[[p.relief(s.name, u, v) for u in range(s.w)] for v in range(s.h)]))
constants = {k: v for module in (p, m) for k, v in vars(module).items() if k.isupper() and isinstance(v, int)}
print(json.dumps(dict(regions=regions, paints=[paint.body for paint in p.palette.BODY_PAINTS],
    constants=constants, deterministic=deterministic, density=p.REGION_DENSITY, atlasDensity=a.TEXELS_PER_PIXEL)))
`,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);

const grooved = ["door_front", "door_rear", "tailgate", "hood_top"];
const c = data.constants;

it("keeps bounded nonemissive flake, contrasting seams and matte hardtops for all paints", () => {
  expect(data.paints).toHaveLength(16);
  expect(data.density).toBe(data.atlasDensity);
  for (const region of data.regions.filter((r) => grooved.includes(r.name))) {
    for (const [i, body] of data.paints.entries()) {
      for (const [channel, base] of body.entries()) {
        expect(
          required(required(region.samples[0]).colors[i])[channel],
        ).toBeLessThan(base);
        expect(
          required(required(region.samples[1]).colors[i])[channel],
        ).toBeGreaterThan(base);
      }
    }
  }
  fc.assert(
    fc.property(fc.constantFrom(...data.regions), fc.nat(), (region, index) => {
      const sample = required(region.samples[index % region.samples.length]);
      for (const [i, body] of data.paints.entries()) {
        const color = required(sample.colors[i]);
        const mer = required(sample.mers[i]);
        expect(color[3]).toBe(255);
        expect(mer[1]).toBe(0);
        expect(mer[3]).toBe(255);
        if (region.base === "body") {
          expect(Math.abs(mer[0] - c.PAINT_METALNESS)).toBeLessThanOrEqual(
            c.FLAKE_METAL_JITTER,
          );
          expect(Math.abs(mer[2] - c.PAINT_ROUGHNESS)).toBeLessThanOrEqual(
            c.FLAKE_ROUGH_JITTER,
          );
          for (const [channel, base] of body.entries()) {
            if (sample.kind === "groove")
              expect(color[channel]).toBeLessThan(base);
            else if (sample.kind === "highlight")
              expect(color[channel]).toBeGreaterThan(base);
            else if (sample.kind === null)
              expect(
                Math.abs(required(color[channel]) - base),
              ).toBeLessThanOrEqual(c.FLAKE_COLOR_JITTER);
          }
        } else {
          expect(mer[0]).toBe(0);
          expect(Math.abs(mer[2] - c.HARDTOP_ROUGHNESS)).toBeLessThanOrEqual(
            c.HARDTOP_GRAIN,
          );
          expect(color).toEqual(sample.colors[0]);
          expect(mer).toEqual(sample.mers[0]);
        }
      }
    }),
  );
});

it("draws exactly one groove texel and one highlight texel along every panel edge", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...grooved),
      fc.integer({ min: 0, max: 3 }),
      fc.nat(),
      (name, edge, position) => {
        const region = data.regions.find((r) => r.name === name);
        if (!region) throw new Error(name);
        const vertical = edge < 2;
        // Keep away from intersecting edge bands so the inward samples measure this edge alone.
        const along = 4 + (position % ((vertical ? region.h : region.w) - 8));
        for (let depth = 0; depth < 3; depth++) {
          const u = vertical
            ? edge === 0
              ? depth
              : region.w - 1 - depth
            : along;
          const v = vertical
            ? along
            : edge === 2
              ? depth
              : region.h - 1 - depth;
          const kind = required(region.kinds[v])[u];
          if (depth === 0) {
            expect(kind).toBe("groove");
            expect(required(region.relief[v])[u]).toBe(c.GROOVE_RELIEF);
          } else if (depth === 1) expect(kind).toBe("highlight");
          else {
            expect(kind).not.toBe("groove");
            expect(kind).not.toBe("highlight");
          }
        }
      },
    ),
  );
});

it("limits edge detail to the four panels and preserves door handle recesses", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...data.regions),
      fc.nat(),
      fc.nat(),
      (region, x, y) => {
        if (!grooved.includes(region.name)) {
          expect(required(region.kinds[y % region.h])[x % region.w]).toBeNull();
          expect(
            required(region.relief[y % region.h])[x % region.w],
          ).toBeNull();
        }
      },
    ),
  );
  for (const region of data.regions.filter((r) => r.name.startsWith("door_"))) {
    expect(region.recess).toEqual([
      "recess",
      c.RECESS_RELIEF,
      "recess_highlight",
    ]);
  }
});

it("reproduces the same output from a fresh module in reverse evaluation order", () => {
  expect(data.deterministic).toBe(true);
});
