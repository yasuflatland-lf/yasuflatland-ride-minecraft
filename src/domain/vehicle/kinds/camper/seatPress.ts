import { SwitchCooldown } from "../../../shared/switchCooldown";
import type { Vec3 } from "../../../shared/vec";
import { CAMPER_SPEC } from "./spec";

// A dinette deck seat stands on the floor layer, under its slot cell; the cells from the
// seat's own up to the ceiling layer are searched for the slot (ADR 0068, 0097).
const SEAT_SLOT_SEARCH_LAYERS = 3;

/** The lowest cell from the seat's own up that holds a decor slot's block, if any (ADR 0097). */
export function seatSlotCell(
  seat: Vec3,
  holdsSlot: (cell: Vec3) => boolean,
): Vec3 | undefined {
  const x = Math.floor(seat.x);
  const z = Math.floor(seat.z);
  const bottom = Math.floor(seat.y);
  for (let y = bottom; y < bottom + SEAT_SLOT_SEARCH_LAYERS; y++) {
    const cell = { x, y, z };
    if (holdsSlot(cell)) return cell;
  }
  return undefined;
}

/**
 * Gear presses on deck seats, per player. The entity event has no isFirstEvent, and a
 * held press repeats on later ticks, so a press counts only after the player's presses
 * have been idle for CAMPER_SPEC.seatPressIdleTicks; every press restarts the idle
 * time, so one long-press places one item (ADR 0024, 0097).
 */
export class SeatPresses<K> {
  private readonly last = new Map<K, SwitchCooldown>();

  /** Records a press by `player` at `tick`; true when it starts a new press. */
  press(tick: number, player: K): boolean {
    let cooldown = this.last.get(player);
    if (cooldown === undefined) {
      cooldown = new SwitchCooldown();
      this.last.set(player, cooldown);
    }
    return cooldown.tryUse(tick, CAMPER_SPEC.seatPressIdleTicks);
  }
}
