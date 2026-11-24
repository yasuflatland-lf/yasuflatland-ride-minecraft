import { type BlockFace, isTopFace } from "../shared/blockFace";
import type { Cell } from "../shared/cells";
import { facePlayer } from "../shared/facing";
import type { Brand } from "../shared/ids";
import { CHAIR_SPEC } from "./spec";

export type ChairKindId = "low_chair" | "noga_chair";

/** The Entity.id of a chair. */
export type ChairId = Brand<string, "ChairId">;

/** Brands an id that is known to belong to a chair. Called only in the infrastructure layer and in tests. */
export function asChairId(raw: string): ChairId {
  return raw as ChairId;
}

/** The block the chair stands on: the clicked one, but only from its top face. */
export function chairCell(clicked: Cell, face: BlockFace): Cell | undefined {
  return isTopFace(face) ? clicked : undefined;
}

/**
 * The chair's yaw, facing the player who placed it: the player's yaw turned
 * half a circle, snapped to CHAIR_SPEC.yawStep, in (-180, 180].
 */
export function chairYaw(playerYaw: number): number {
  return facePlayer(playerYaw, CHAIR_SPEC.yawStep);
}

/** Whether every block from 1 to CHAIR_SPEC.clearance above the clicked one is air. */
export function canPlaceChair(isAir: (dy: number) => boolean): boolean {
  for (let dy = 1; dy <= CHAIR_SPEC.clearance; dy++) {
    if (!isAir(dy)) return false;
  }
  return true;
}
