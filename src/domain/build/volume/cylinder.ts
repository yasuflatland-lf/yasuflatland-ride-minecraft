import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { Box } from "../box";
import type { HeightedGeometry, HeightedSpec } from "./geometry";

function* columns(base: Box) {
  const { min, max } = base;
  const widthSquared = (max.x - min.x + 1) ** 2;
  const depthSquared = (max.z - min.z + 1) ** 2;
  const inside = (x: number, z: number): boolean =>
    (2 * x - min.x - max.x) ** 2 * depthSquared +
      (2 * z - min.z - max.z) ** 2 * widthSquared <=
    widthSquared * depthSquared;

  for (let z = min.z; z <= max.z; z++) {
    for (let x = min.x; x <= max.x; x++) {
      if (!inside(x, z)) continue;
      const wall =
        !inside(x - 1, z) ||
        !inside(x + 1, z) ||
        !inside(x, z - 1) ||
        !inside(x, z + 1);
      yield { x, z, wall };
    }
  }
}

export const cylinderGeometry: HeightedGeometry = {
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
  maxHeight(base, worldTopY) {
    return Math.max(1, worldTopY - base.min.y + 1);
  },
  wireframe: cylinderWireframe,
};

function cylinderWireframe(
  { base: { min, max }, height }: HeightedSpec,
  maxPoints: number,
): Vec3[] {
  const budget = Math.max(0, Math.floor(maxPoints));
  const cx = (min.x + max.x + 1) / 2;
  const cz = (min.z + max.z + 1) / 2;
  const rx = (max.x - min.x + 1) / 2;
  const rz = (max.z - min.z + 1) / 2;
  const bottom = min.y + 0.5;
  const top = min.y + height - 0.5;
  const points: Vec3[] = [];
  for (let curve = 0; curve < 6; curve++) {
    const count = Math.floor(budget / 6) + (curve < budget % 6 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const angle =
        curve < 2 ? (2 * Math.PI * i) / count : ((curve - 2) * Math.PI) / 2;
      const t = count === 1 ? 0.5 : i / (count - 1);
      points.push({
        x: cx + rx * Math.cos(angle),
        y:
          curve < 2
            ? curve === 0
              ? bottom
              : top
            : bottom + t * (top - bottom),
        z: cz + rz * Math.sin(angle),
      });
    }
  }
  return points;
}
