import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type Bone,
  type Triple,
  turn,
  turnedCorners,
} from "../support/geometry";
import { dimension } from "../support/suvDimensions";

const bones = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
)["minecraft:geometry"][0].bones as Bone[];
type Channels = { rotation?: Triple; position?: Triple; scale?: Triple };
type Keyframes = {
  rotation: Record<string, Triple>;
  position: Record<string, Triple>;
};
const { animations } = JSON.parse(
  readFileSync("packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json", "utf8"),
) as {
  animations: Record<string, { bones: Record<string, unknown> }>;
};
const clip = <T = Channels>(name: string): Record<string, T> => {
  const animation = animations[`animation.yasu_ride.suv.${name}`];
  if (!animation) throw new Error(`Missing animation ${name}`);
  return animation.bones as Record<string, T>;
};
const subtract = (a: Triple, b: Triple): Triple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Triple, b: Triple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Triple, b: Triple): Triple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vec = (f: (i: number) => number): Triple => [f(0), f(1), f(2)];

function box(points: Triple[]) {
  const at = (i: number): Triple => {
    const p = points[i];
    if (!p) throw new Error(`Missing corner ${i}`);
    return p;
  };
  const edges = [4, 2, 1].map((i) => subtract(at(i), at(0)));
  const half = edges.map((edge) => Math.hypot(...edge) / 2);
  const axes = edges.map((edge) =>
    vec((i) => (edge[i] ?? 0) / Math.hypot(...edge)),
  );
  return {
    center: vec((i) => ((at(0)[i] ?? 0) + (at(7)[i] ?? 0)) / 2),
    axes,
    half,
    min: vec((i) => Math.min(...points.map((p) => p[i] ?? 0))),
    max: vec((i) => Math.max(...points.map((p) => p[i] ?? 0))),
  };
}
type Box = ReturnType<typeof box>;
const EPS = 1e-8;
function intersects(a: Box, b: Box): boolean {
  // AABBs only reject distant pairs; rotated flare cubes require all 15 SAT axes.
  if (
    [0, 1, 2].some(
      (i) =>
        (a.max[i] ?? 0) <= (b.min[i] ?? 0) + EPS ||
        (b.max[i] ?? 0) <= (a.min[i] ?? 0) + EPS,
    )
  )
    return false;
  const delta = subtract(b.center, a.center);
  const radius = (bounds: Box, axis: Triple) =>
    bounds.axes.reduce(
      (sum, direction, i) =>
        sum + Math.abs(dot(direction, axis)) * (bounds.half[i] ?? 0),
      0,
    );
  const axes = [
    ...a.axes,
    ...b.axes,
    ...a.axes.flatMap((x) => b.axes.map((y) => cross(x, y))),
  ];
  return axes.every((axis) => {
    const length = Math.hypot(...axis);
    if (length < EPS) return true;
    return (
      Math.abs(dot(delta, axis)) <
      radius(a, axis) + radius(b, axis) - EPS * length
    );
  });
}

function descendsFromBody(bone: Bone): boolean {
  if (bone.name === "body") return true;
  const parent = bones.find((b) => b.name === bone.parent);
  return parent ? descendsFromBody(parent) : false;
}
const body = bones.filter(descendsFromBody).flatMap((bone) =>
  (bone.cubes ?? []).map((cube, index) => ({
    name: `${bone.name}/${index}`,
    bounds: box(turnedCorners(bone, cube)),
  })),
);
const interpolate = (frames: Record<string, Triple>, t: number): Triple => {
  const start = frames["0.0"];
  const end = frames["1.0"];
  if (!start || !end) throw new Error("Missing fold endpoint");
  return vec((i) => (start[i] ?? 0) + ((end[i] ?? 0) - (start[i] ?? 0)) * t);
};

describe("SUV wheel fold clearance", () => {
  for (const corner of ["fl", "fr", "rl", "rr"]) {
    it(`keeps wheel_${corner} clear of the body during the fold and hides its road shaft`, () => {
      const name = `wheel_${corner}`;
      const wheel = bones.find((b) => b.name === name);
      const folded = clip("wheels_folded")[name];
      const deploy = clip<Keyframes>("wheels_deploy")[name];
      if (!wheel?.pivot || !wheel.cubes?.length || !folded || !deploy)
        throw new Error(`Missing wheel ${name}`);
      const pivot = wheel.pivot;
      expect(clip("wheels")[`arm_${corner}`]?.scale).toEqual([0, 0, 0]);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const rotation =
          t === 1 ? folded.rotation : interpolate(deploy.rotation, t);
        const position =
          t === 1 ? folded.position : interpolate(deploy.position, t);
        if (!rotation || !position)
          throw new Error(`Missing fold transform ${name}`);
        const points = wheel.cubes.map((cube) =>
          turnedCorners(wheel, cube).map((point) => {
            const rotated = turn(point, pivot, rotation);
            return vec((i) => (rotated[i] ?? 0) + (position[i] ?? 0));
          }),
        );
        const collisions = points.flatMap((corners, i) => {
          const bounds = box(corners);
          return body
            .filter((b) => intersects(bounds, b.bounds))
            .map((b) => `${i} intersects ${b.name}`);
        });
        expect(collisions, `${name} at t=${t}`).toEqual([]);
        if (t === 1) {
          const side = Math.sign(wheel.pivot[0]);
          const inner = Math.min(...points.flat().map((p) => p[0] * side));
          expect(inner).toBeGreaterThan(dimension("OVERFENDER_HALF_WIDTH"));
        }
      }
    });
  }
});
