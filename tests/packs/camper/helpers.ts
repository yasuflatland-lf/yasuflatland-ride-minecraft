import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import {
  DECOR_SPOTS,
  type DecorSlot,
} from "../../../src/domain/vehicle/kinds/camper/furniture";
import { readRgbaPng } from "../../support/png";
import type { PythonWorker } from "../../support/pythonWorker";
export const RP = "packs/yasu_ride_rp";
export const geometryText = readFileSync(
  `${RP}/models/entity/yasu_ride/camper.geo.json`,
  "utf8",
);
export interface Cube {
  origin: number[];
  size: number[];
  pivot?: number[];
  rotation?: number[];
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
}
export interface Bone {
  name: string;
  parent?: string;
  pivot: number[];
  rotation?: number[];
  cubes?: Cube[];
  locators?: Record<string, number[]>;
}
export const geometry = JSON.parse(geometryText)["minecraft:geometry"][0];
export const bones: Bone[] = geometry.bones;
export const bone = (name: string) => {
  const found = bones.find((b) => b.name === name);
  expect(found, name).toBeDefined();
  return found as Bone;
};
export const end = (cube: Cube, axis: number) =>
  (cube.origin[axis] ?? 0) + (cube.size[axis] ?? 0);

export const readPng = (path: string) => readRgbaPng(`${RP}/${path}.png`);

const registry: {
  base: [number, number];
  baseSize: [number, number];
  size: [number, number];
  slots: string[];
  faces: Record<string, [number, number]>;
} = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
kit = load_tool('camper_kit')
print(json.dumps(dict(base=kit.LAYOUT.origin('base'), baseSize=[kit.BASE_REF.region.width, kit.BASE_REF.region.height], size=kit.LAYOUT.size, slots=kit.SLOTS, faces={name: kit.ATLAS.face(name)['uv'] for name in kit.SLOTS})))`,
    ],
    { encoding: "utf8" },
  ),
);
export const baseOrigin = registry.base;
export const baseSize = registry.baseSize;
export const paletteSlots = registry.slots;
export const swatchUv = (name: string): [number, number] => {
  const face = registry.faces[name];
  if (!face) throw new Error(`Missing camper swatch: ${name}`);
  return face;
};
export const ALUMINIUM_SLOT = swatchUv("aluminium")[0];
export const swatch = (c: Cube, name: string) => {
  const [u, v] = swatchUv(name);
  return c.uv.north?.uv[0] === u && c.uv.north?.uv[1] === v;
};
export const cubeCenter = (c: Cube, axis: number) =>
  (c.origin[axis] ?? 0) + (c.size[axis] ?? 0) / 2;

export const near = (a: number | undefined, b: number) =>
  Math.abs((a ?? Number.NaN) - b) < 1e-6;
export const extent = (cube: Cube, axis: number) => {
  const lo = cube.origin[axis] ?? 0;
  return [lo, lo + (cube.size[axis] ?? 0)] as const;
};

export const WHEELS = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];

// The ceiling plate's underside, 29 px above a layer-2 cell's bottom (ADR 0093).
export const PLATE_UNDERSIDE = 29;
// A hanging decor item's top: the top of its cell, where the hook ends (ADR 0099).
export const HANG_TOP = 16;
const STEPS = 4;

// A slot's spot in model pixels: x = 16 * left, z = -16 * forward (the front is -z, ADR 0009).
export const slotXZ = (slot: DecorSlot) => {
  const spot = DECOR_SPOTS[slot.spot ?? 0] ?? { left: 0, forward: 0 };
  return {
    x: 16 * slot.cell.x + spot.left,
    z: -16 * slot.cell.z - spot.forward,
  };
};

export const turn = (point: number[], pivot: number[], rotation: number[]) => {
  let [x = 0, y = 0, z = 0] = point.map((v, i) => v - (pivot[i] ?? 0));
  // The game turns z the other way from right-handed math (mirror_x in tools/gen_camper.py).
  const [rx = 0, ry = 0, rz = 0] = rotation;
  for (const [axis, degrees] of [
    ["x", rx],
    ["y", ry],
    ["z", -rz],
  ] as const) {
    const s = Math.sin((degrees * Math.PI) / 180);
    const c = Math.cos((degrees * Math.PI) / 180);
    if (axis === "x") [y, z] = [y * c - z * s, y * s + z * c];
    else if (axis === "y") [x, z] = [x * c + z * s, -x * s + z * c];
    else [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z].map((v, i) => v + (pivot[i] ?? 0));
};
// Points on every body cube, rotated ones included, STEPS + 1 per edge.
export const bodyPoints = () =>
  (bone("body").cubes ?? []).flatMap((cube) => {
    const out: number[][] = [];
    for (let i = 0; i <= STEPS; i++)
      for (let j = 0; j <= STEPS; j++)
        for (let k = 0; k <= STEPS; k++) {
          const p = [i, j, k].map(
            (n, axis) =>
              (cube.origin[axis] ?? 0) + ((cube.size[axis] ?? 0) * n) / STEPS,
          );
          out.push(
            cube.rotation && cube.pivot
              ? turn(p, cube.pivot, cube.rotation)
              : p,
          );
        }
    return out;
  });

// The slots that share their furniture cell with another item (ADR 0108), and the stove's.
export const SHARED_KINDS = ["stove", "fridge", "table", "wall_cabinet"];

export const loadAtlas = async (python: PythonWorker) =>
  JSON.parse(
    await python.run(
      [
        "import contextlib, io, json, runpy, sys",
        "sys.argv = ['tools/gen_camper.py', 'packs/yasu_ride_rp', '--check']",
        "with contextlib.redirect_stdout(io.StringIO()):",
        "    camper = runpy.run_path('tools/gen_camper.py')",
        "atlas = camper['ATLAS']",
        "ox, oy = camper['LAYOUT'].origin('base')",
        "regions = [[r.name, ox + r.x, oy + r.y, r.w, r.h] for r in atlas.regions]",
        "print(json.dumps(dict(width=camper['LAYOUT'].size[0], height=camper['LAYOUT'].size[1], base=[ox, oy, atlas.width, atlas.height], regions=regions, period=camper['RIB_PERIOD_TEXELS'], texelsPerPx=camper['RIB_TEXELS_PER_PX'], slots=camper['SLOTS'], windows=[camper['right_windows'], camper['left_windows']])))",
      ].join("\n"),
    ),
  ) as {
    width: number;
    height: number;
    base: [number, number, number, number];
    regions: [string, number, number, number, number][];
    period: number;
    texelsPerPx: number;
    slots: string[];
    windows: number[][][];
  };
