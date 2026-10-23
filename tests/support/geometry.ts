type Triple = [number, number, number];

interface Cube {
  origin: Triple;
  size: Triple;
  inflate?: number;
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

function corners(cube: Cube): Triple[] {
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
function turn(point: Triple, pivot: Triple, rotation: Triple): Triple {
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

/** The 8 corners of a cube (inflate included), turned by the cube's rotation, then the bone's. */
export function turnedCorners(bone: Bone, cube: Cube): Triple[] {
  return corners(cube).map((point) => {
    if (cube.rotation && cube.pivot)
      point = turn(point, cube.pivot, cube.rotation);
    if (bone.rotation && bone.pivot)
      point = turn(point, bone.pivot, bone.rotation);
    return point;
  });
}
