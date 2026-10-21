// Collision floor geometry and water-relative hold height for a stopped sports boat (ADR 0063).
import { clamp, forward, type Vec2 } from "../../../shared/vec";
import type { DockCell, HoldPose } from "../../dock/floor";
import { toLocal } from "../../seats";
import { SPORTSBOAT_SPEC } from "./spec";

export interface DeckPart {
  readonly halfWidth: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly height: number;
}

/** From SPORTSBOAT_SPEC (ADR 0063). */
export const DECK_DRAFT = SPORTSBOAT_SPEC.deckDraft;

const PIXELS_PER_BLOCK = 16;
const WATER_OFFSETS = [2, 1, 0, -1] as const;

export const DECK = Object.freeze({
  margin: SPORTSBOAT_SPEC.deckMargin,
  // From tools/gen_sportsboat.py, in blocks: x = left, z = forward;
  // collision tops include the measured 0.3 px of teak (ADR 0063).
  parts: Object.freeze<DeckPart[]>([
    {
      halfWidth: 0.96,
      zMin: -2.75,
      zMax: 0.875,
      height: 9.3 / PIXELS_PER_BLOCK,
    },
    {
      halfWidth: 0.22,
      zMin: 0.875,
      zMax: 1.125,
      height: 11.3 / PIXELS_PER_BLOCK,
    },
    {
      halfWidth: 0.69,
      zMin: 1.125,
      zMax: 2.5,
      height: 11.3 / PIXELS_PER_BLOCK,
    },
  ]),
});

// A covered cell center lies inside a grown part, so it is no farther from the
// pose than that part's farthest corner, whatever the yaw. Today that is the
// cockpit's (1.26, -3.05), about 3.3 blocks; deriving the radius keeps the scan
// wide enough if a part grows.
const SCAN_RADIUS = Math.max(
  ...DECK.parts.map((part) =>
    Math.hypot(
      part.halfWidth + DECK.margin,
      Math.max(Math.abs(part.zMin), Math.abs(part.zMax)) + DECK.margin,
    ),
  ),
);

function covers(part: DeckPart, local: Vec2): boolean {
  return (
    Math.abs(local.x) <= part.halfWidth + DECK.margin &&
    local.z >= part.zMin - DECK.margin &&
    local.z <= part.zMax + DECK.margin
  );
}

/** First and last block whose center lies within the scan radius of `center`. */
function scanRange(center: number): readonly [number, number] {
  return [
    // Math.ceil gives -0 between -1 and 0, which would leak into cell keys.
    Math.ceil(center - SCAN_RADIUS - 0.5) || 0,
    Math.floor(center + SCAN_RADIUS - 0.5),
  ];
}

export function floorCells(pose: HoldPose): DockCell[] {
  const f = forward(pose.yaw);
  const [xMin, xMax] = scanRange(pose.x);
  const [zMin, zMax] = scanRange(pose.z);
  const cells: DockCell[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let z = zMin; z <= zMax; z++) {
      const local = toLocal({ x: x + 0.5 - pose.x, z: z + 0.5 - pose.z }, f);
      const heights = DECK.parts
        .filter((part) => covers(part, local))
        .map((part) => part.height);
      if (heights.length === 0) continue;
      const top = pose.y + Math.max(...heights);
      const y = Math.floor(top);
      const height = clamp(
        Math.round((top - y) * PIXELS_PER_BLOCK),
        1,
        PIXELS_PER_BLOCK,
      );
      cells.push({ x, y, z, block: { type: "deck", height } });
    }
  }
  return cells;
}

export function holdHeight(
  feetY: number,
  waterAt: (dy: number) => boolean,
): number | undefined {
  for (const dy of WATER_OFFSETS) {
    if (waterAt(dy)) return Math.floor(feetY + dy) + 1 - DECK_DRAFT;
  }
  return undefined;
}
