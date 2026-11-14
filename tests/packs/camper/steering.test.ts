import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Bone as GeometryBone,
  type Triple,
  turn,
  turnedCorners,
} from "../../support/geometry";
import { bone, type Cube } from "./helpers";

const subtract = (a: Triple, b: Triple): Triple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Triple, b: Triple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Triple, b: Triple, t: number): Triple => [
  a[0] + b[0] * t,
  a[1] + b[1] * t,
  a[2] + b[2] * t,
];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const prepare = (c: Cube, owner = bone("body")) => {
  const corners = turnedCorners(owner as GeometryBone, {
    origin: c.origin as Triple,
    size: c.size as Triple,
    ...(c.pivot ? { pivot: c.pivot as Triple } : {}),
    ...(c.rotation ? { rotation: c.rotation as Triple } : {}),
  });
  const axes = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Triple[]
  ).map((p) => {
    const q = turn(p, [0, 0, 0], (c.rotation ?? [0, 0, 0]) as Triple);
    return turn(q, [0, 0, 0], (owner.rotation ?? [0, 0, 0]) as Triple);
  });
  const intervals = axes.map(
    (u) =>
      [
        Math.min(...corners.map((p) => dot(p, u))),
        Math.max(...corners.map((p) => dot(p, u))),
      ] as const,
  );
  const edges: [Triple, Triple][] = [];
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4])
      if (!(i & bit))
        edges.push([corners[i] as Triple, corners[i | bit] as Triple]);
  return { corners, axes, intervals, edges };
};
type Box = ReturnType<typeof prepare>;
const pointGap = (p: Triple, b: Box) =>
  Math.sqrt(
    b.axes.reduce((sum, u, i) => {
      const [lo, hi] = b.intervals[i] as readonly [number, number];
      return sum + Math.max(0, lo - dot(p, u), dot(p, u) - hi) ** 2;
    }, 0),
  );
const edgeGap = ([a, b]: [Triple, Triple], [c, d]: [Triple, Triple]) => {
  const u = subtract(b, a),
    v = subtract(d, c),
    w = subtract(a, c);
  const A = dot(u, u),
    B = dot(u, v),
    C = dot(v, v),
    D = dot(u, w),
    E = dot(v, w);
  const denominator = A * C - B * B;
  let s = denominator > 1e-12 ? clamp((B * E - C * D) / denominator) : 0;
  let t = (B * s + E) / C;
  if (t < 0) {
    t = 0;
    s = clamp(-D / A);
  } else if (t > 1) {
    t = 1;
    s = clamp((B - D) / A);
  }
  const delta = subtract(add(a, u, s), add(c, v, t));
  return Math.sqrt(dot(delta, delta));
};
const gap = (a: Box, b: Box) => {
  const cross = (u: Triple, v: Triple): Triple => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const axes = [
    ...a.axes,
    ...b.axes,
    ...a.axes.flatMap((u) => b.axes.map((v) => cross(u, v))),
  ];
  const separated = axes.some((u) => {
    if (dot(u, u) < 1e-12) return false;
    const av = a.corners.map((p) => dot(p, u)),
      bv = b.corners.map((p) => dot(p, u));
    return (
      Math.min(...av) > Math.max(...bv) || Math.min(...bv) > Math.max(...av)
    );
  });
  if (!separated) return 0;
  return Math.min(
    ...a.corners.map((p) => pointGap(p, b)),
    ...b.corners.map((p) => pointGap(p, a)),
    ...a.edges.flatMap((e) => b.edges.map((f) => edgeGap(e, f))),
  );
};
const areas = JSON.parse(
  readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
) as Record<string, Record<string, [number, number]>>;
const area = (name: string) => {
  const range = areas[name]?.body;
  expect(range, name).toBeDefined();
  return (bone("body").cubes ?? []).slice(range?.[0], (range?.[1] ?? -1) + 1);
};
const wheel = bone("steering");
const rim = (wheel.cubes ?? []).slice(0, 64).map((c) => prepare(c, wheel));
const lever = () =>
  area("steering")
    .slice(2)
    .map((c) => prepare(c));
const minimum = (a: Box[], b: Box[]) => {
  expect(a.length).toBeGreaterThan(0);
  expect(b.length).toBeGreaterThan(0);
  let best = Infinity;
  for (const x of a)
    for (const y of b) {
      const lower = Math.sqrt(
        [0, 1, 2].reduce(
          (sum, i) =>
            sum +
            Math.max(
              0,
              Math.min(...x.corners.map((p) => p[i] ?? 0)) -
                Math.max(...y.corners.map((p) => p[i] ?? 0)),
              Math.min(...y.corners.map((p) => p[i] ?? 0)) -
                Math.max(...x.corners.map((p) => p[i] ?? 0)),
            ) **
              2,
          0,
        ),
      );
      if (lower < best) best = Math.min(best, gap(x, y));
    }
  return best;
};

describe("camper steering clearances", () => {
  it("clears the dash face by at least 1.5 px", () => {
    // Approved face top and normal are measured independently of the builder.
    const origin: Triple = [0, 35, -50.59285714285714];
    const angle = (57.50556662216273 * Math.PI) / 180;
    const normal: Triple = [0, Math.sin(angle), Math.cos(angle)];
    expect(
      Math.min(
        ...rim.flatMap((b) =>
          b.corners.map((p) => dot(subtract(p, origin), normal)),
        ),
      ),
    ).toBeGreaterThanOrEqual(1.5);
  });
  it("clears the seat cushion by at least 1 px", () => {
    const cushion = (bone("seat_0").cubes ?? []).filter(
      (c) => (c.origin[1] ?? 0) < 28,
    );
    expect(
      minimum(
        rim,
        cushion.map((c) => prepare(c, bone("seat_0"))),
      ),
    ).toBeGreaterThanOrEqual(1);
  });
  it("clears the side wall by at least 0.6 px", () => {
    expect(
      Math.min(...rim.flatMap((b) => b.corners.map((p) => p[0] + 22.5))),
    ).toBeGreaterThanOrEqual(0.6);
  });
  it("clears the lever from the wheel and dash by at least 0.3 px", () => {
    expect(lever()).toHaveLength(30);
    expect(
      minimum(
        lever(),
        (wheel.cubes ?? []).map((c) => prepare(c, wheel)),
      ),
    ).toBeGreaterThanOrEqual(0.3);
    expect(
      minimum(
        lever(),
        area("cab").map((c) => prepare(c)),
      ),
    ).toBeGreaterThanOrEqual(0.3);
  });
});
