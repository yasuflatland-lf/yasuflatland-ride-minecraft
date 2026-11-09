import type { CellBox } from "../../../domain/build/box";
import { buildId } from "../identifiers";

const STRUCTURE_PURPOSE = "box";
const FILL_LIMIT = 32_768;
// Candidate engine limits from ADR 0243; not yet measured on BDS.
const AXIS_LIMITS = { x: 64, y: 256, z: 64 } as const;

export function structureIdentifier(ownerId: string, counter: number): string {
  // Fixed-width UTF-16 encoding preserves arbitrary player IDs without collisions.
  let encoded = "";
  for (let i = 0; i < ownerId.length; i++) {
    encoded += ownerId.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return buildId(`${STRUCTURE_PURPOSE}_${encoded}_${counter}`);
}

export function isStructureTooLarge(box: CellBox): boolean {
  return (Object.keys(AXIS_LIMITS) as (keyof typeof AXIS_LIMITS)[]).some(
    (axis) => box.max[axis] - box.min[axis] + 1 > AXIS_LIMITS[axis],
  );
}

export function* fillChunks(box: CellBox): Generator<CellBox> {
  const dx = Math.min(FILL_LIMIT, box.max.x - box.min.x + 1);
  const dy = Math.min(Math.floor(FILL_LIMIT / dx), box.max.y - box.min.y + 1);
  const dz = Math.min(
    Math.floor(FILL_LIMIT / (dx * dy)),
    box.max.z - box.min.z + 1,
  );
  for (let x = box.min.x; x <= box.max.x; x += dx) {
    for (let y = box.min.y; y <= box.max.y; y += dy) {
      for (let z = box.min.z; z <= box.max.z; z += dz) {
        yield {
          min: { x, y, z },
          max: {
            x: Math.min(x + dx - 1, box.max.x),
            y: Math.min(y + dy - 1, box.max.y),
            z: Math.min(z + dz - 1, box.max.z),
          },
        };
      }
    }
  }
}
