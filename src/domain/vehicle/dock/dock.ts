// What a held vehicle keeps around it while it stands still (ADR 0063, 0064, 0068).

import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { DockCell, HoldPose } from "./floor";

/** Values infrastructure reads from the vehicle's dynamic properties (laid cells, decor), not entity properties. */
export const DOCK_RESTORED = {
  laid: "dockLaid",
  doorOpen: "dockDoorOpen",
  decor: "dockDecor",
} as const;

export type DockRestoredKey =
  (typeof DOCK_RESTORED)[keyof typeof DOCK_RESTORED];

/** Present only while a drive holds its vehicle; a kind that never holds never returns one. */
export interface Dock {
  readonly hold: HoldPose;
  readonly cells: readonly DockCell[];
  /**
   * Deck seat i stands at seat i of the vehicle's profile, and the profile's parked
   * seats follow in order; undefined where that vehicle seat has a rider (ADR 0063, 0095).
   */
  readonly seats: readonly (DeckSeatSpot | undefined)[];
}

/** Where a deck seat stands. A compact seat has a small hit box, so the floor around it still takes long-presses (ADR 0095). */
export interface DeckSeatSpot extends Vec3 {
  readonly compact?: boolean;
  /**
   * Where a rider who stands up from this seat while the vehicle stays parked is put,
   * feet on the floor, in place of the engine's dismount spot. Left out, the engine's
   * spot stands (ADR 0109).
   */
  readonly stand?: Vec3;
}

/** A block to remove before laying cells, and the type it had when the drive checked it. */
export interface ClearCell extends Cell {
  readonly typeId: string;
}

/** An axis-aligned box in world coordinates: min inclusive, max exclusive. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Where standing players are looked for when a vehicle departs, and where those without a seat go. */
export interface Departure {
  readonly boxes: readonly Box[];
  readonly exit?: HoldPose;
}

export function inBox(box: Box, at: Vec3): boolean {
  return (
    at.x >= box.min.x &&
    at.x < box.max.x &&
    at.y >= box.min.y &&
    at.y < box.max.y &&
    at.z >= box.min.z &&
    at.z < box.max.z
  );
}
