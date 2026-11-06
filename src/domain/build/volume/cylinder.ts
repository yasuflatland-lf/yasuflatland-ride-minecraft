import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { CellBox } from "../box";
import { ellipse, line, outlinePoints } from "../wireframe";
import { ellipseCells } from "./ellipse";
import type {
  HeightedPlacement,
  HeightedVolume,
  HeightStepSpec,
} from "./geometry";

function* columns(base: CellBox) {
  for (const { u, v, wall } of ellipseCells({
    uMin: base.min.x,
    uMax: base.max.x,
    vMin: base.min.z,
    vMax: base.max.z,
  })) {
    yield { x: u, z: v, wall };
  }
}

export const cylinderPlacement: HeightedPlacement = {
  *cells({ base, height }, fill): Generator<Cell> {
    for (const { x, z, wall } of columns(base)) {
      if (fill === "tube" && !wall) continue;
      for (let layer = 0; layer < height; layer++) {
        if (fill === "hollow" && !wall && layer > 0 && layer < height - 1)
          continue;
        yield { x, y: base.min.y + layer, z };
      }
    }
  },
  count({ base, height }, fill) {
    let insideCount = 0;
    let wallCount = 0;
    for (const { wall } of columns(base)) {
      insideCount++;
      if (wall) wallCount++;
    }
    if (fill === "fill") return insideCount * height;
    if (fill === "tube") return wallCount * height;
    const capLayers = Math.min(2, height);
    return insideCount * capLayers + wallCount * (height - capLayers);
  },
};

export const cylinderVolume: HeightedVolume = {
  maxHeight(base, worldTopY) {
    return Math.max(1, worldTopY - base.min.y + 1);
  },
  wireframe: cylinderWireframe,
};

function cylinderWireframe(
  { base: { min, max }, height }: HeightStepSpec,
  maxPoints: number,
): Vec3[] {
  const cx = (min.x + max.x + 1) / 2;
  const cz = (min.z + max.z + 1) / 2;
  const rx = (max.x - min.x + 1) / 2;
  const rz = (max.z - min.z + 1) / 2;
  const bottom = min.y + 0.5;
  const top = min.y + height - 0.5;
  const rings =
    height === 1
      ? [ellipse(cx, bottom, cz, rx, rz)]
      : [ellipse(cx, bottom, cz, rx, rz), ellipse(cx, top, cz, rx, rz)];
  const sides =
    height === 1
      ? []
      : [
          [rx, 0],
          [0, rz],
          [-rx, 0],
          [0, -rz],
        ].map(([dx, dz]) =>
          line(
            { x: cx + (dx as number), y: bottom, z: cz + (dz as number) },
            { x: cx + (dx as number), y: top, z: cz + (dz as number) },
          ),
        );
  return outlinePoints(rings, sides, maxPoints);
}
