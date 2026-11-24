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
export function tableCells(clicked: Vec3, yaw: number): [Vec3, Vec3] {
  const neighbor =
    Math.abs(yaw) % 180 === 0
      ? { ...clicked, x: clicked.x + 1 }
      : { ...clicked, z: clicked.z + 1 };
  return [clicked, neighbor];
}

export function tableOrigin(clicked: Vec3, yaw: number): Vec3 {
  const [, neighbor] = tableCells(clicked, yaw);
  return {
    x: (clicked.x + neighbor.x + 1) / 2,
    y: clicked.y + 1,
    z: (clicked.z + neighbor.z + 1) / 2,
  };
}
