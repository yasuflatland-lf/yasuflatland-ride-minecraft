import fc from "fast-check";
import { afterAll, expect, it } from "vitest";

import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

type Rgba = [number, number, number, number];
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Missing painter data");
  return value;
};

type Sample = {
  u: number;
  v: number;
  kind: string | null;
  colors: Rgba[];
  mers: Rgba[];
  paintMer: Rgba;
};
type Region = {
  name: string;
  w: number;
  h: number;
  base: string;
  kinds: (string | null)[][];
  relief: (number | null)[][];
  samples: Sample[];
  means: number[][];
  recess: (string | number | null)[];
};
const data: {
  regions: Region[];
  paints: number[][];
  paintNames: string[];
  swatches: Rgba[];
  bodyPalette: number[];
  constants: Record<
    | "PAINT_METALNESS"
    | "PAINT_ROUGHNESS"
    | "FLAKE_METAL_JITTER"
    | "FLAKE_ROUGH_JITTER"
    | "FLAKE_COLOR_JITTER"
    | "HARDTOP_ROUGHNESS"
    | "HARDTOP_GRAIN"
    | "GROOVE_RELIEF"
    | "RECESS_RELIEF"
    | "SHEEN_ROWS"
    | "SHADE_ROWS"
    | "SHEEN_LIGHTEN"
    | "SHADE_DARKEN",
    number
  >;
  deterministic: boolean;
  density: number;
  atlasDensity: number;
} = JSON.parse(
  await python.run(
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
    for u, v in [(0, 0), (1, 1), (s.w // 2, 2), (s.w // 2, s.h - 3)] + [points[p.texel_hash(i, 7) % len(points)] for i in range(256)]:
        samples.append(dict(u=u, v=v,
            paintMer=[m.PAINT_METALNESS + p.jitter(u, v, p.FLAKE_METAL_JITTER, 8), 0,
                      m.PAINT_ROUGHNESS + p.jitter(u, v, p.FLAKE_ROUGH_JITTER, 16), 255], kind=p.detail(s.name, u, v),
            colors=[p.color(s.name, u, v, paint) for paint in p.palette.BODY_PAINTS],
            mers=[p.mer(s.name, u, v, paint).rgba() for paint in p.palette.BODY_PAINTS]))
    for u, v in reversed(points):
        for paint in p.palette.BODY_PAINTS:
            deterministic &= p.detail(s.name, u, v) == fresh.detail(s.name, u, v)
            deterministic &= p.color(s.name, u, v, paint) == fresh.color(s.name, u, v, paint)
            deterministic &= p.mer(s.name, u, v, paint) == fresh.mer(s.name, u, v, paint)
    handle = []
    if s.name.startswith('door_'):
        x, y, rx, ry = p.recess(s.name)
        handle = [p.detail(s.name, int(x), int(y)), p.relief(s.name, int(x), int(y)),
                  p.detail(s.name, int(x), int(y + ry * 0.6))]
    means = [[sum(p.color(s.name, u, v, paint)[channel] for u, v in points) / len(points)
              for channel in range(3)] for paint in p.palette.BODY_PAINTS] if s.name in ('door_front', 'door_rear', 'tailgate') else []
    regions.append(dict(means=means, name=s.name, w=s.w, h=s.h, base=s.base, samples=samples, recess=handle,
        kinds=[[p.detail(s.name, u, v) for u in range(s.w)] for v in range(s.h)],
        relief=[[p.relief(s.name, u, v) for u in range(s.w)] for v in range(s.h)]))
constants = {k: v for module in (p, m) for k, v in vars(module).items() if k.isupper() and isinstance(v, int)}
face = a.ATLAS.face('body')
x, y = [int(origin + size / 2) for origin, size in zip(face['uv'], face['uv_size'])]
swatches = [load_tool('suv_texture').paint_pixel(paint)(x, y) for paint in p.palette.BODY_PAINTS]
print(json.dumps(dict(paintNames=[paint.name for paint in p.palette.BODY_PAINTS],
    swatches=swatches, bodyPalette=p.palette.PALETTE['body'], regions=regions, paints=[paint.body for paint in p.palette.BODY_PAINTS],
    constants=constants, deterministic=deterministic, density=p.REGION_DENSITY, atlasDensity=a.TEXELS_PER_PIXEL)))
`,
  ),
);

const grooved = ["door_front", "door_rear", "tailgate", "hood_top"];
const shaded = ["door_front", "door_rear", "tailgate"];
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
      if (sample.kind === "sheen" || sample.kind === "shade") {
        expect(shaded).toContain(region.name);
        expect(required(region.relief[sample.v])[sample.u]).toBeNull();
      }
      for (const [i, body] of data.paints.entries()) {
        const color = required(sample.colors[i]);
        const mer = required(sample.mers[i]);
        expect(color[3]).toBe(255);
        expect(mer[1]).toBe(0);
        expect(mer[3]).toBe(255);
        if (region.base === "body") {
          expect(mer).toEqual(sample.paintMer);
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
            else if (sample.kind === "sheen" && base < 255)
              expect(color[channel]).toBeGreaterThan(base);
            else if (sample.kind === "shade" && base > 0)
              expect(color[channel]).toBeLessThan(base);
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

it("keeps the soft bands inside the doors and tailgate without adding relief", () => {
  expect(c.SHEEN_ROWS).toBe(3);
  expect(c.SHADE_ROWS).toBe(2);
  expect(c.SHEEN_LIGHTEN).toBe(5);
  expect(c.SHADE_DARKEN).toBe(6);
  for (const region of data.regions.filter((r) => shaded.includes(r.name))) {
    expect(region.kinds.flat()).toContain("sheen");
    expect(region.kinds.flat()).toContain("shade");
  }
  fc.assert(
    fc.property(
      fc.constantFrom(...data.regions),
      fc.nat(),
      fc.nat(),
      (region, x, y) => {
        const u = x % region.w;
        const v = y % region.h;
        const kind = required(region.kinds[v])[u];
        if (kind === "sheen" || kind === "shade") {
          expect(shaded).toContain(region.name);
          expect(required(region.relief[v])[u]).toBeNull();
        }
        const edge = Math.min(u, v, region.w - 1 - u, region.h - 1 - v);
        if (
          shaded.includes(region.name) &&
          edge >= 2 &&
          kind !== "recess" &&
          kind !== "recess_highlight"
        ) {
          expect(kind).toBe(
            v >= 2 && v < 5
              ? "sheen"
              : v >= region.h - 4 && v <= region.h - 3
                ? "shade"
                : null,
          );
        }
      },
    ),
  );
});

it("preserves every base paint swatch and the mean colour of each whole panel", () => {
  const expected = {
    khaki: [142, 128, 88],
    green: [62, 96, 56],
    red: [128, 22, 26],
    white: [222, 222, 216],
    light_gray: [156, 156, 152],
    gray: [92, 94, 98],
    black: [34, 34, 36],
    orange: [190, 92, 28],
    yellow: [214, 178, 44],
    lime: [112, 160, 42],
    cyan: [30, 118, 124],
    light_blue: [92, 150, 204],
    blue: [40, 58, 128],
    purple: [94, 46, 128],
    magenta: [160, 52, 140],
    pink: [214, 132, 162],
  };
  expect(
    Object.fromEntries(
      data.paintNames.map((name, i) => [name, data.paints[i]]),
    ),
  ).toEqual(expected);
  expect(data.bodyPalette).toEqual(expected.khaki);
  for (const [i, body] of data.paints.entries()) {
    expect(data.swatches[i]).toEqual([...body, 255]);
    for (const region of data.regions.filter((r) => shaded.includes(r.name))) {
      for (const [channel, base] of body.entries()) {
        expect(
          Math.abs(required(required(region.means[i])[channel]) - base),
        ).toBeLessThanOrEqual(4);
      }
    }
  }
});
