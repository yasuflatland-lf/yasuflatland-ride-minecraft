import {
  type Bone,
  boneChain,
  type Triple,
  worldCorners,
} from "../support/geometry";
import {
  type ModelFace,
  modelFaces,
  overlapArea,
  PLANE_BUCKET_SCALE,
  planeBucketKey,
  type UvRect,
} from "../support/modelFaces";
import {
  EXCLUSIVE_BONES,
  type ExclusiveOption,
  MIN_OVERLAP_AREA,
  PLANE_TOLERANCE,
  RGB_TOLERANCE,
} from "./coplanarFaces.config";

export interface Geometry {
  description: {
    identifier: string;
    texture_width: number;
    texture_height: number;
  };
  bones: Bone[];
}

interface Texture {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface BoundedFace {
  face: ModelFace;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  ground: boolean;
  exclusive: ExclusiveOption | undefined;
}

interface Finding {
  a: ModelFace;
  b: ModelFace;
  area: number;
}

// The dominant-axis projection must be the same for a bucket and its neighbours.
function bucketPlane(key: string) {
  const [direction = "", offset = "0"] = key.split(":");
  const [x = 0, y = 0, z = 0] = direction.split(",").map(Number);
  const normalLength = Math.hypot(x, y, z);
  const normal: Triple = [x / normalLength, y / normalLength, z / normalLength];
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)] as const;
  const axes =
    ax >= ay && ax >= az
      ? ([1, 2] as const)
      : ay >= az
        ? ([0, 2] as const)
        : ([0, 1] as const);
  return { axes, normal, offset: Number(offset) / PLANE_BUCKET_SCALE };
}

function boundedFace(
  face: ModelFace,
  { axes: [u, v], normal: [x, y, z], offset }: ReturnType<typeof bucketPlane>,
  lowestY: number,
  exclusive: ExclusiveOption | undefined,
): BoundedFace {
  const [a, b, c, d] = face.corners;
  // Points that coincide in the clipper differ along its common normal.
  // That normal is nearly parallel to this bucket's normal, so twice the
  // depth difference bounds their separation. Split the neighbour gap
  // across the two faces and include each face's spread about its bucket.
  const depthError = ([px, py, pz]: Triple) =>
    Math.abs(px * x + py * y + pz * z - offset);
  const pad =
    2 * Math.max(depthError(a), depthError(b), depthError(c), depthError(d)) +
    1 / PLANE_BUCKET_SCALE;
  return {
    face,
    minU: Math.min(a[u], b[u], c[u], d[u]) - pad,
    maxU: Math.max(a[u], b[u], c[u], d[u]) + pad,
    minV: Math.min(a[v], b[v], c[v], d[v]) - pad,
    maxV: Math.max(a[v], b[v], c[v], d[v]) + pad,
    ground:
      face.side === "down" &&
      face.corners.every((corner) => corner[1] - lowestY <= PLANE_TOLERANCE),
    exclusive,
  };
}

function lowestWorldY(bones: Bone[]): number {
  let y = Infinity;
  for (const bone of bones) {
    for (const cube of bone.cubes ?? []) {
      for (const corner of worldCorners(bones, bone, cube)) {
        y = Math.min(y, corner[1]);
      }
    }
  }
  return y;
}

function texelSpan(
  start: number,
  end: number,
  limit: number,
): [number, number] {
  const first = Math.max(0, Math.ceil(start - 0.5));
  const last = Math.min(limit - 1, Math.floor(end - 0.5));
  if (first <= last) return [first, last];
  const nearest = Math.max(
    0,
    Math.min(limit - 1, Math.floor((start + end) / 2)),
  );
  return [nearest, nearest];
}

function textureColors(texture: Texture, description: Geometry["description"]) {
  const scaleU = texture.width / description.texture_width;
  const scaleV = texture.height / description.texture_height;
  const cache = new Map<string, Triple | null>();
  return ({ u, v, w, h }: UvRect): Triple | null => {
    const [left, right] = texelSpan(
      u * scaleU,
      (u + w) * scaleU,
      texture.width,
    );
    const [top, bottom] = texelSpan(
      v * scaleV,
      (v + h) * scaleV,
      texture.height,
    );
    const key = `${left},${right},${top},${bottom}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let red = 0;
    let green = 0;
    let blue = 0;
    let visible = false;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const index = 4 * (y * texture.width + x);
        red += texture.pixels[index] ?? 0;
        green += texture.pixels[index + 1] ?? 0;
        blue += texture.pixels[index + 2] ?? 0;
        visible ||= (texture.pixels[index + 3] ?? 0) > 0;
      }
    }
    const count = (right - left + 1) * (bottom - top + 1);
    const rgb: Triple | null = visible
      ? [red / count, green / count, blue / count]
      : null;
    cache.set(key, rgb);
    return rgb;
  };
}

export function findCoplanarFaces(
  geometry: Geometry,
  texture: Texture,
): Finding[] {
  const { bones, description } = geometry;
  const lowestY = lowestWorldY(bones);
  const lookup = EXCLUSIVE_BONES[description.identifier];
  const options = new Map<string, ExclusiveOption>();
  if (lookup) {
    for (const bone of bones) {
      for (const ancestor of boneChain(bones, bone)) {
        const key = lookup(ancestor.name);
        if (!key) continue;
        options.set(bone.name, key);
        break;
      }
    }
  }

  const planes = new Map<string, ModelFace[]>();
  for (const face of modelFaces(geometry)) {
    const key = planeBucketKey(face);
    const bucket = planes.get(key);
    if (bucket) bucket.push(face);
    else planes.set(key, [face]);
  }
  const buckets = new Map<string, BoundedFace[]>();
  for (const [key, faces] of planes) {
    const plane = bucketPlane(key);
    buckets.set(
      key,
      faces
        .map((face) =>
          boundedFace(face, plane, lowestY, options.get(face.bone)),
        )
        .sort((a, b) => a.minU - b.minU),
    );
  }

  const findings: Finding[] = [];
  const color = textureColors(texture, description);
  const check = (a: BoundedFace, b: BoundedFace) => {
    if (b.maxU <= a.minU || b.minV >= a.maxV || b.maxV <= a.minV) return;
    if (a.face.bone === b.face.bone && a.face.cubeIndex === b.face.cubeIndex)
      return;
    if (a.ground && b.ground) return;
    if (
      a.exclusive &&
      b.exclusive &&
      a.exclusive.slot === b.exclusive.slot &&
      a.exclusive.option !== b.exclusive.option
    )
      return;

    const ca = color(a.face.uv);
    if (!ca) return;
    const cb = color(b.face.uv);
    if (
      !cb ||
      Math.max(
        Math.abs(ca[0] - cb[0]),
        Math.abs(ca[1] - cb[1]),
        Math.abs(ca[2] - cb[2]),
      ) <= RGB_TOLERANCE
    )
      return;

    const area = overlapArea(a.face, b.face);
    if (area > MIN_OVERLAP_AREA) findings.push({ a: a.face, b: b.face, area });
  };

  for (const [key, bucket] of buckets) {
    const separator = key.lastIndexOf(":") + 1;
    const offset = Number(key.slice(separator));
    // The higher neighbour is enough to visit each unordered pair once.
    const next = buckets.get(`${key.slice(0, separator)}${offset + 1}`) ?? [];
    let first = 0;
    for (const [i, a] of bucket.entries()) {
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j];
        if (!b || b.minU >= a.maxU) break;
        check(a, b);
      }
      while (first < next.length && (next[first]?.maxU ?? Infinity) <= a.minU)
        first++;
      for (let j = first; j < next.length; j++) {
        const b = next[j];
        if (!b || b.minU >= a.maxU) break;
        check(a, b);
      }
    }
  }
  return findings;
}
