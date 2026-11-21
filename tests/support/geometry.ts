export type Triple = [number, number, number];

export interface Cube {
  origin: Triple;
  size: Triple;
  inflate?: number;
  uv?:
    | Record<string, { uv: [number, number]; uv_size: [number, number] }>
    | [number, number];
  pivot?: Triple;
  rotation?: Triple;
}

export interface Bone {
  name: string;
  parent?: string;
  cubes?: Cube[];
  pivot?: Triple;
  rotation?: Triple;
}

function corners(cube: Omit<Cube, "uv">): Triple[] {
  const grow = cube.inflate ?? 0;
  const [x0, y0, z0] = cube.origin;
  const [w, h, d] = cube.size;
  const points: Triple[] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1])
        points.push([
          x0 - grow + i * (w + 2 * grow),
          y0 - grow + j * (h + 2 * grow),
          z0 - grow + k * (d + 2 * grow),
        ]);
  return points;
}

// As tools/render_preview.py's rotate() with game_turn(): x, then y, then z, with x and
// z turning the other way in game (ADR 0051, 0058).
export function turn(point: Triple, pivot: Triple, rotation: Triple): Triple {
  let x = point[0] - pivot[0];
  let y = point[1] - pivot[1];
  let z = point[2] - pivot[2];
  const rx = (-rotation[0] * Math.PI) / 180;
  const ry = (rotation[1] * Math.PI) / 180;
  const rz = (-rotation[2] * Math.PI) / 180;
  [y, z] = [
    y * Math.cos(rx) - z * Math.sin(rx),
    y * Math.sin(rx) + z * Math.cos(rx),
  ];
  [x, z] = [
    x * Math.cos(ry) + z * Math.sin(ry),
    -x * Math.sin(ry) + z * Math.cos(ry),
  ];
  [x, y] = [
    x * Math.cos(rz) - y * Math.sin(rz),
    x * Math.sin(rz) + y * Math.cos(rz),
  ];
  return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

/**
 * The 8 corners of a cube (inflate included), turned by the cube's rotation, then its own bone's.
 * Ancestor bone rotations are not applied, so this is only right for models that nest no rotated
 * bone inside another.
 */
export function turnedCorners<
  B extends Omit<Bone, "cubes">,
  C extends Omit<Cube, "uv">,
>(bone: B, cube: C): Triple[] {
  return corners(cube).map((point) => {
    if (cube.rotation && cube.pivot)
      point = turn(point, cube.pivot, cube.rotation);
    if (bone.rotation && bone.pivot)
      point = turn(point, bone.pivot, bone.rotation);
    return point;
  });
}

export function boneChain(bones: Bone[], bone: Bone): Bone[] {
  const chain = [bone];
  const visited = new Set([bone.name]);
  let current = bone;
  while (current.parent !== undefined) {
    if (visited.has(current.parent)) {
      throw new Error(
        `Bone "${bone.name}" has a parent cycle at "${current.parent}"`,
      );
    }
    const parent = bones.find(({ name }) => name === current.parent);
    if (!parent) {
      throw new Error(
        `Bone "${bone.name}" has missing parent "${current.parent}"`,
      );
    }
    chain.push(parent);
    visited.add(parent.name);
    current = parent;
  }
  return chain;
}

type Corners = [Triple, Triple, Triple, Triple, Triple, Triple, Triple, Triple];

/** Corners in x + 2y + 4z order, as in tools/cube_tilt.py. */
export function worldCorners(bones: Bone[], bone: Bone, cube: Cube): Corners {
  const grow = cube.inflate ?? 0;
  const [x, y, z] = cube.origin;
  const [w, h, d] = cube.size;
  const transforms = [cube, ...boneChain(bones, bone)];
  return [0, 1, 2, 3, 4, 5, 6, 7].map((bits) => {
    let point: Triple = [
      x - grow + (bits & 1) * (w + 2 * grow),
      y - grow + ((bits >> 1) & 1) * (h + 2 * grow),
      z - grow + ((bits >> 2) & 1) * (d + 2 * grow),
    ];
    for (const { rotation, pivot } of transforms) {
      if (rotation && pivot) point = turn(point, pivot, rotation);
    }
    return point;
  }) as Corners;
}
