// Each vehicle kind's footprint must cover its whole model at any heading, so things
// placed beside vehicles keep out of the body (ADR 0122).
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS, type VehicleKind } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";

type Triple = [number, number, number];

interface Cube {
  origin: Triple;
  size: Triple;
  inflate?: number;
  pivot?: Triple;
  rotation?: Triple;
}

interface Bone {
  name: string;
  parent?: string;
  cubes?: Cube[];
  pivot?: Triple;
  rotation?: Triple;
}

const PIXELS_PER_BLOCK = 16;

function bones(kind: VehicleKind): Bone[] {
  return JSON.parse(
    readFileSync(
      `packs/yasu_ride_rp/models/entity/yasu_ride/${kind}.geo.json`,
      "utf8",
    ),
  )["minecraft:geometry"][0].bones;
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

// The vehicle models nest no rotated bone inside another, which the turns below assume.
function modelReach(kind: VehicleKind): number {
  let reach = 0;
  for (const bone of bones(kind))
    for (const cube of bone.cubes ?? [])
      for (let point of corners(cube)) {
        if (cube.rotation && cube.pivot)
          point = turn(point, cube.pivot, cube.rotation);
        if (bone.rotation && bone.pivot)
          point = turn(point, bone.pivot, bone.rotation);
        reach = Math.max(reach, Math.hypot(point[0], point[2]));
      }
  return reach / PIXELS_PER_BLOCK;
}

it.each(VEHICLE_KINDS)(
  "gives the %s a footprint that covers its model at any heading",
  (kind) => {
    const turned = new Set(
      bones(kind)
        .filter((bone) => bone.rotation?.some((a) => a !== 0))
        .map((bone) => bone.name),
    );
    expect(
      bones(kind).filter((bone) => bone.parent && turned.has(bone.parent)),
    ).toEqual([]);
    expect(modelReach(kind)).toBeLessThanOrEqual(profileOf(kind).footprint);
  },
);
