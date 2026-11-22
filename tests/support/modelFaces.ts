import { type Bone, type Triple, worldCorners } from "./geometry";

export type FaceSide = "north" | "south" | "east" | "west" | "up" | "down";

export const FACE_SIDES: Readonly<
  Record<FaceSide, { readonly axis: 0 | 1 | 2; readonly sign: -1 | 1 }>
> = {
  north: { axis: 2, sign: -1 },
  south: { axis: 2, sign: 1 },
  east: { axis: 0, sign: -1 },
  west: { axis: 0, sign: 1 },
  up: { axis: 1, sign: 1 },
  down: { axis: 1, sign: -1 },
};

export interface UvRect {
  readonly u: number;
  readonly v: number;
  readonly w: number;
  readonly h: number;
}

export interface ModelFace {
  readonly bone: string;
  readonly cubeIndex: number;
  readonly side: FaceSide;
  readonly corners: readonly [Triple, Triple, Triple, Triple];
  readonly normal: Triple;
  readonly offset: number;
  readonly uv: UvRect;
}

export const PLANE_TOLERANCE = 1e-4;
const NORMAL_TOLERANCE = 1e-3;
export const PLANE_BUCKET_SCALE = 1000;

const dot = (a: Triple, b: Triple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: Triple, b: Triple): Triple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const cross = (a: Triple, b: Triple): Triple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = ([x, y, z]: Triple): Triple => {
  const length = Math.hypot(x, y, z);
  return [x / length || 0, y / length || 0, z / length || 0];
};

const sides = Object.keys(FACE_SIDES) as FaceSide[];
// Counterclockwise from outside, in the same bit order as worldCorners.
const cornerOrder = {
  north: [0, 2, 3, 1],
  south: [4, 5, 7, 6],
  east: [0, 4, 6, 2],
  west: [1, 3, 7, 5],
  up: [2, 6, 7, 3],
  down: [0, 1, 5, 4],
} as const;
const faceAxes = [
  [1, 2],
  [2, 0],
  [0, 1],
] as const;

export function modelFaces(geometry: { bones: Bone[] }): ModelFace[] {
  const faces: ModelFace[] = [];
  for (const bone of geometry.bones) {
    for (const [cubeIndex, cube] of (bone.cubes ?? []).entries()) {
      if (!cube.uv || Array.isArray(cube.uv)) continue;
      const points = worldCorners(geometry.bones, bone, cube);
      const grow = 2 * (cube.inflate ?? 0);
      for (const side of sides) {
        const mapping = cube.uv[side];
        if (!mapping) continue;
        const [i, j] = faceAxes[FACE_SIDES[side].axis];
        if (cube.size[i] + grow === 0 || cube.size[j] + grow === 0) continue;

        const [a, b, c, d] = cornerOrder[side];
        const first = points[a];
        const normal = unit(
          cross(subtract(points[b], first), subtract(points[d], first)),
        );
        const [u, v] = mapping.uv;
        const [w, h] = mapping.uv_size;
        faces.push({
          bone: bone.name,
          cubeIndex,
          side,
          corners: [first, points[b], points[c], points[d]],
          normal,
          offset: dot(normal, first),
          uv: {
            u: Math.min(u, u + w),
            v: Math.min(v, v + h),
            w: Math.abs(w),
            h: Math.abs(h),
          },
        });
      }
    }
  }
  return faces;
}

type Point = [number, number];

function clipPolygon(polygon: Point[], start: Point, end: Point): Point[] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = ([x, y]: Point) => dx * (y - start[1]) - dy * (x - start[0]);
  const clipped: Point[] = [];
  let previous = polygon.at(-1);
  if (!previous) return clipped;
  let before = distance(previous);
  for (const point of polygon) {
    const after = distance(point);
    if (before < 0 !== after < 0) {
      const t = before / (before - after);
      clipped.push([
        previous[0] + t * (point[0] - previous[0]),
        previous[1] + t * (point[1] - previous[1]),
      ]);
    }
    if (after >= 0) clipped.push(point);
    previous = point;
    before = after;
  }
  return clipped;
}

export function overlapArea(a: ModelFace, b: ModelFace): number {
  if (Math.abs(a.offset - b.offset) > PLANE_TOLERANCE) return 0;
  const delta = subtract(a.normal, b.normal);
  if (dot(delta, delta) > NORMAL_TOLERANCE ** 2) return 0;

  // Projection preserves a world coordinate when both normals have zero
  // component along that axis. Disjoint intervals then stay disjoint.
  for (const axis of [0, 1, 2] as const) {
    if (a.normal[axis] !== 0 || b.normal[axis] !== 0) continue;
    const [p, q, r, s] = a.corners;
    const [t, u, v, w] = b.corners;
    if (
      Math.max(p[axis], q[axis], r[axis], s[axis]) <
        Math.min(t[axis], u[axis], v[axis], w[axis]) ||
      Math.max(t[axis], u[axis], v[axis], w[axis]) <
        Math.min(p[axis], q[axis], r[axis], s[axis])
    )
      return 0;
  }

  // Project onto a common plane so neither face's normal controls the result.
  const normal = unit([
    a.normal[0] + b.normal[0],
    a.normal[1] + b.normal[1],
    a.normal[2] + b.normal[2],
  ]);
  const ref: Triple = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = unit(cross(ref, normal));
  const y = cross(normal, x);
  const project = (point: Triple): Point => {
    const relative = subtract(point, a.corners[0]);
    return [dot(relative, x), dot(relative, y)];
  };
  const [p, q, r, s] = b.corners.map(project) as [Point, Point, Point, Point];
  let polygon = a.corners.map(project);
  for (const [start, end] of [
    [p, q],
    [q, r],
    [r, s],
    [s, p],
  ] as const) {
    polygon = clipPolygon(polygon, start, end);
    if (polygon.length < 3) return 0;
  }

  let twiceArea = 0;
  let previous = polygon[polygon.length - 1] ?? [0, 0];
  for (const point of polygon) {
    twiceArea += previous[0] * point[1] - previous[1] * point[0];
    previous = point;
  }
  return Math.abs(twiceArea) / 2;
}

export function planeBucketKey(face: ModelFace): string {
  const [x, y, z] = face.normal;
  return `${Math.round(x * PLANE_BUCKET_SCALE)},${Math.round(y * PLANE_BUCKET_SCALE)},${Math.round(z * PLANE_BUCKET_SCALE)}:${Math.round(face.offset * PLANE_BUCKET_SCALE)}`;
}
