// Placing camping gear on the parked camper's furniture (ADR 0093, 0097, 0105, 0110).
import type { Vec3 } from "../../../shared/vec";
import type { DecorPlacement } from "../../dock/decor";
import type { HoldPose } from "../../dock/floor";
import { CAMPING_GEAR_IDS, HANGING_GEAR_IDS } from "./campingGear";
import { cellTaken, DECOR_SLOTS } from "./decor";
import type { DecorSlot } from "./furniture";
import { decorOverCell, decorSlotCell, decorSpotOffset } from "./room";

const PX_PER_BLOCK = 16;

const sameWorldCell = (a: Vec3, b: Vec3): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * The slots that accept `item`, in slot order; none for an unknown item. A standing
 * item fits every standing slot, and a hanging item only a hanging slot (ADR 0097, 0102).
 */
export function slotsFor(item: string): DecorSlot[] {
  if (!CAMPING_GEAR_IDS.includes(item)) return [];
  const hanging = HANGING_GEAR_IDS.has(item);
  return DECOR_SLOTS.filter((slot) => (slot.hanging === true) === hanging);
}

/** The point on a slot's surface where its decor stands: its spot from the host cell's middle, over its furniture (ADR 0107, 0108). */
export function slotPoint(pose: HoldPose, slot: DecorSlot): Vec3 {
  const c = decorSlotCell(pose, slot);
  const offset = decorSpotOffset(pose.yaw, slot.spot ?? 0);
  return {
    x: c.x + 0.5 + offset.x,
    y: c.y + slot.height / PX_PER_BLOCK,
    z: c.z + 0.5 + offset.z,
  };
}

/**
 * Where the line of sight from `eye` through `point` crosses the horizontal plane at
 * height `y`. A ray that hits a furniture block's side face below its top crosses the
 * top's plane over the spot the player looked at, not at the side (ADR 0110). Without
 * an eye, or when the ray does not descend to the plane, the pressed point itself.
 */
function sightAt(eye: Vec3 | undefined, point: Vec3, y: number): Vec3 {
  if (eye === undefined) return point;
  const dy = point.y - eye.y;
  if (dy >= 0 || y >= eye.y) return point;
  const t = (y - eye.y) / dy;
  return {
    x: eye.x + (point.x - eye.x) * t,
    y,
    z: eye.z + (point.z - eye.z) * t,
  };
}

/**
 * The slot among `slots` whose point is nearest where the line of sight from `eye`
 * through `pressed` crosses that slot's surface (ADR 0110); on a tie, the one listed first.
 */
function nearest(
  pose: HoldPose,
  slots: readonly DecorSlot[],
  pressed: Vec3,
  eye: Vec3 | undefined,
): DecorSlot | undefined {
  let best: DecorSlot | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const p = slotPoint(pose, slot);
    const point = sightAt(eye, pressed, p.y);
    const distance =
      (p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (p.z - point.z) ** 2;
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The free slot accepting `item` whose point is nearest `point`, or with `eye`, nearest
 * where the line of sight through `point` crosses its surface (ADR 0110); on a tie, the
 * slot listed first. A slot is free while no slot of its cell holds decor (ADR 0107) and
 * `clear` says its cell can take a decor block: a host cell outside its furniture is
 * air while empty, so a player's block may stand there (ADR 0108). Undefined when
 * every accepting slot is taken.
 */
export function nearestFreeSlot(
  pose: HoldPose,
  item: string,
  decor: readonly DecorPlacement[],
  point: Vec3,
  clear: (slot: DecorSlot) => boolean,
  eye?: Vec3,
): DecorSlot | undefined {
  return nearest(
    pose,
    slotsFor(item).filter((slot) => !cellTaken(slot, decor) && clear(slot)),
    point,
    eye,
  );
}

/** The slots whose world cell is `cell` at `pose`, in DECOR_SLOTS order. */
export function slotsAt(pose: HoldPose, cell: Vec3): DecorSlot[] {
  return DECOR_SLOTS.filter((slot) =>
    sameWorldCell(decorSlotCell(pose, slot), cell),
  );
}

/**
 * The slots of the furniture under a press on `cell`, in DECOR_SLOTS order: those drawn over
 * `cell`, and those drawn over the furniture of a slot hosted in `cell`. A press on a shelf
 * board, the table, or either item on them names both of their slots (ADR 0108).
 */
export function pressedSlots(pose: HoldPose, cell: Vec3): DecorSlot[] {
  const overs = [
    cell,
    ...slotsAt(pose, cell).map((s) => decorOverCell(pose, s)),
  ];
  return DECOR_SLOTS.filter((slot) => {
    const over = decorOverCell(pose, slot);
    return overs.some((c) => sameWorldCell(c, over));
  });
}

/**
 * The free slot accepting `item` nearest `point` among the pressed furniture's slots, when
 * it has one; otherwise the free accepting slot nearest `point` (ADR 0093, 0097, 0105,
 * 0108), or none when `exact`: a press on a dinette seat names one slot, and filling
 * another one left the player unable to tell where the item went (ADR 0104). A slot is
 * free as in nearestFreeSlot, `clear` included. With the player's `eye`, nearness is
 * measured where the line of sight crosses each slot's surface (ADR 0110).
 */
export function slotForPress(
  pose: HoldPose,
  item: string,
  decor: readonly DecorPlacement[],
  cell: Vec3,
  point: Vec3,
  exact: boolean,
  clear: (slot: DecorSlot) => boolean,
  eye?: Vec3,
): DecorSlot | undefined {
  const accepting = new Set(slotsFor(item));
  const pressed = pressedSlots(pose, cell).filter(
    (slot) => accepting.has(slot) && !cellTaken(slot, decor) && clear(slot),
  );
  if (pressed.length > 0) return nearest(pose, pressed, point, eye);
  if (exact) return undefined;
  return nearestFreeSlot(pose, item, decor, point, clear, eye);
}
