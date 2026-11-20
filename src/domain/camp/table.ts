import { facePlayer } from "../shared/facing";
import type { Brand } from "../shared/ids";
import type { Vec3 } from "../shared/vec";

export type TableId = Brand<string, "TableId">;

export function asTableId(raw: string): TableId {
  return raw as TableId;
}

/** The long axis follows the player's nearest quarter turn. */
export function tableYaw(playerYaw: number): number {
  return facePlayer(playerYaw);
}

/** The clicked ground cell and its neighbor under the other end. */
export function tableCells(clicked: Vec3, yaw: number): Vec3[] {
  const alongX = Math.abs(yaw) % 180 === 0;
  return [0, 1].map((offset) => ({
    x: clicked.x + (alongX ? offset : 0),
    y: clicked.y,
    z: clicked.z + (alongX ? 0 : offset),
  }));
}
