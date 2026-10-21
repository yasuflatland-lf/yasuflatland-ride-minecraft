// Placing camping gear on the parked camper's furniture (ADR 0093).
import type { Vec3 } from "../../../shared/vec";
import type { DecorPlacement } from "../../dock/decor";
import type { HoldPose } from "../../dock/floor";
import { CAMPING_GEAR } from "./campingGear";
import {
  CAMPER_FURNITURE,
  type DecorSlot,
  type FurnitureKind,
} from "./furniture";
import { decorSlotCell } from "./room";

const PX_PER_BLOCK = 16;

/** Every decor slot with its furniture kind, in DECOR_SLOTS order. */
const SLOTS: readonly { kind: FurnitureKind; slot: DecorSlot }[] =
  CAMPER_FURNITURE.flatMap((f) =>
    f.slots.map((slot) => ({ kind: f.kind, slot })),
  );

/** The slots that accept `item`, in slot order; none for an unknown item. */
export function slotsFor(item: string): DecorSlot[] {
  const places = CAMPING_GEAR.get(item) ?? [];
  return SLOTS.filter(
    ({ kind }) =>
      places.includes(kind) ||
      // A wall cabinet top is used like a shelf (ADR 0093).
      (kind === "wall_cabinet" && places.includes("shelf")),
  ).map(({ slot }) => slot);
}

/** The middle of a slot's surface, where its decor stands. */
export function slotPoint(pose: HoldPose, slot: DecorSlot): Vec3 {
  const c = decorSlotCell(pose, slot);
  return { x: c.x + 0.5, y: c.y + slot.height / PX_PER_BLOCK, z: c.z + 0.5 };
}

/**
 * The free slot accepting `item` whose surface middle is nearest `point`;
 * on a tie, the slot listed first. Undefined when every accepting slot is taken.
 */
export function nearestFreeSlot(
  pose: HoldPose,
  item: string,
  decor: readonly DecorPlacement[],
  point: Vec3,
): DecorSlot | undefined {
  let best: DecorSlot | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of slotsFor(item)) {
    if (decor.some((d) => d.slot === slot.id)) continue;
    const p = slotPoint(pose, slot);
    const distance =
      (p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (p.z - point.z) ** 2;
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

/** The slot whose world cell is `cell` at `pose`, if any. */
export function slotAt(pose: HoldPose, cell: Vec3): DecorSlot | undefined {
  return SLOTS.find(({ slot }) => {
    const c = decorSlotCell(pose, slot);
    return c.x === cell.x && c.y === cell.y && c.z === cell.z;
  })?.slot;
}
