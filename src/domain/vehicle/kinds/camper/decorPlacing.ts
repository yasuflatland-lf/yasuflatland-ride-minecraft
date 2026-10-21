// Placing camping gear on the parked camper's furniture (ADR 0093, 0097).
import type { Vec3 } from "../../../shared/vec";
import type { DecorPlacement } from "../../dock/decor";
import type { HoldPose } from "../../dock/floor";
import { CAMPING_GEAR_IDS, HANGING_GEAR_IDS } from "./campingGear";
import { DECOR_SLOTS } from "./decor";
import type { DecorSlot } from "./furniture";
import { decorSlotCell } from "./room";

const PX_PER_BLOCK = 16;

/**
 * The slots that accept `item`, in slot order; none for an unknown item. A standing
 * item fits every standing slot, and a hanging item only a hanging slot (ADR 0097, 0102).
 */
export function slotsFor(item: string): DecorSlot[] {
  if (!CAMPING_GEAR_IDS.includes(item)) return [];
  const hanging = HANGING_GEAR_IDS.has(item);
  return DECOR_SLOTS.filter((slot) => (slot.hanging === true) === hanging);
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
  return DECOR_SLOTS.find((slot) => {
    const c = decorSlotCell(pose, slot);
    return c.x === cell.x && c.y === cell.y && c.z === cell.z;
  });
}

/**
 * The slot of the pressed `cell` when it accepts `item` and is free; otherwise the
 * free accepting slot nearest `point` (ADR 0093, 0097), or none when `exact`: a
 * press on a dinette seat names one slot, and filling another one left the player
 * unable to tell where the item went (ADR 0104).
 */
export function slotForPress(
  pose: HoldPose,
  item: string,
  decor: readonly DecorPlacement[],
  cell: Vec3,
  point: Vec3,
  exact: boolean,
): DecorSlot | undefined {
  const pressed = slotAt(pose, cell);
  if (
    pressed &&
    !decor.some((d) => d.slot === pressed.id) &&
    slotsFor(item).some((s) => s.id === pressed.id)
  )
    return pressed;
  if (exact) return undefined;
  return nearestFreeSlot(pose, item, decor, point);
}
