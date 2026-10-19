// What a held vehicle keeps around it while it stands still (ADR 0063, 0064, 0068).
import type { Vec3 } from "../shared/vec";
import type { DockCell, HoldPose } from "./floor";
import type { Cell } from "./headlights";

/** Present only while a drive holds its vehicle; a kind that never holds never returns one. */
export interface Dock {
  readonly hold: HoldPose;
  readonly cells: readonly DockCell[];
  /** Deck seat i stands at seat i of the vehicle's profile; undefined where that seat has a rider. */
  readonly seats: readonly (Vec3 | undefined)[];
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
