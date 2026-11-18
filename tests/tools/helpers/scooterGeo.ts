import { readFileSync } from "node:fs";
import { type Triple, turnedCorners } from "../../support/geometry";

type Cube = {
  origin: Triple;
  size: Triple;
  pivot?: Triple;
  rotation?: Triple;
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
};
type Geometry = {
  bones: {
    name: string;
    parent?: string;
    pivot: Triple;
    rotation?: Triple;
    locators?: Record<string, Triple>;
    cubes?: Cube[];
  }[];
  description: { texture_width: number; texture_height: number };
};

const geometry: Geometry = JSON.parse(
  readFileSync(".cache/generated/scooter_source.geo.json", "utf8"),
);

export function loadScooterGeo(): Geometry {
  return geometry;
}

export function boneCubes(name: string): Cube[] {
  const bone = loadScooterGeo().bones.find((bone) => bone.name === name);
  if (!bone) throw new Error(`Unknown scooter bone: ${name}`);
  return bone.cubes ?? [];
}

// Keep the generated model frame, including its final x mirror, as in the pack tests.
export function cubeBounds(cube: Cube): [Triple, Triple] {
  const corners = turnedCorners({ name: "root" }, cube);
  const min = [0, 1, 2].map((axis) =>
    Math.min(...corners.map((p) => p[axis] ?? 0)),
  ) as Triple;
  const max = [0, 1, 2].map((axis) =>
    Math.max(...corners.map((p) => p[axis] ?? 0)),
  ) as Triple;
  return [min, max];
}
