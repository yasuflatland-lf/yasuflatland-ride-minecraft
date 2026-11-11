import type { Vec3 } from "../../shared/vec";
import type { CellBox } from "../box";
import { BUILD_SPEC } from "../spec";
import { line, tieredPoints } from "../wireframe";

export function pasteOutline(
  { min, max }: CellBox,
  maxPoints: number,
): { horizontal: Vec3[]; vertical: Vec3[] } {
  const x0 = min.x + 0.5;
  const x1 = max.x + 0.5;
  const z0 = min.z + 0.5;
  const z1 = max.z + 0.5;
  const yLow = min.y + 0.5;
  const yHigh = max.y + 0.5;
  const ring = (y: number) => [
    line({ x: x0, y, z: z0 }, { x: x1, y, z: z0 }),
    line({ x: x0, y, z: z1 }, { x: x1, y, z: z1 }),
    line({ x: x0, y, z: z0 }, { x: x0, y, z: z1 }),
    line({ x: x1, y, z: z0 }, { x: x1, y, z: z1 }),
  ];
  const uprights = (from: number, to: number) =>
    [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x0, z: z1 },
      { x: x1, z: z1 },
    ].map((corner) => line({ ...corner, y: from }, { ...corner, y: to }));
  const bottom = ring(yLow);
  const lower = yHigh > yLow ? uprights(yLow, Math.min(yLow + 1, yHigh)) : [];
  const top = yHigh > yLow ? ring(yHigh) : [];
  // The dense segment already includes yLow + 1; sparse centers resume one block above it.
  const upper = yHigh > yLow + 1 ? uprights(yLow + 2, yHigh) : [];
  const [ground = [], ceiling = [], sides = []] = tieredPoints(
    [
      {
        curves: [...bottom, ...lower],
        perBlock: BUILD_SPEC.denseOutlinePerBlock,
      },
      { curves: top, perBlock: 1 },
      { curves: upper, perBlock: 1 },
    ],
    maxPoints,
  );
  return {
    horizontal: [...ground.slice(0, bottom.length).flat(), ...ceiling.flat()],
    vertical: [...ground.slice(bottom.length).flat(), ...sides.flat()],
  };
}
