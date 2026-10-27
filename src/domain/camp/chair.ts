// Where a chair goes when its item is used on a block, and which way it faces (ADR 0122).
import type { Vec3 } from "../shared/vec";
import { CHAIR_SPEC } from "./spec";

export type ChairKindId = "low_chair";

/** The Entity.id of a chair. */
export type ChairId = string & { readonly __brand: "ChairId" };

/** Brands an id that is known to belong to a chair. Called only in the infrastructure layer and in tests. */
export function asChairId(raw: string): ChairId {
  return raw as ChairId;
}

/** The face of a block that was clicked. */
export type ChairFace = "up" | "down" | "north" | "south" | "east" | "west";

/** The block the chair stands on: the clicked one, but only from its top face. */
export function chairCell(clicked: Vec3, face: ChairFace): Vec3 | undefined {
  return face === "up" ? clicked : undefined;
}

/**
 * The chair's yaw, facing the player who placed it: the player's yaw turned
 * half a circle, snapped to CHAIR_SPEC.yawStep, in (-180, 180].
 */
export function chairYaw(playerYaw: number): number {
  const step = CHAIR_SPEC.yawStep;
  const snapped = Math.round((playerYaw + 180) / step) * step;
  const yaw = (((snapped % 360) + 360) % 360) + 0;
  return yaw > 180 ? yaw - 360 : yaw;
}

/** Whether every block from 1 to CHAIR_SPEC.clearance above the clicked one is air. */
export function canPlaceChair(isAir: (dy: number) => boolean): boolean {
  for (let dy = 1; dy <= CHAIR_SPEC.clearance; dy++) {
    if (!isAir(dy)) return false;
  }
  return true;
}
