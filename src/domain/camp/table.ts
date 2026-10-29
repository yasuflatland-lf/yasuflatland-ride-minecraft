import type { Vec3 } from "../shared/vec";

export type TableId = string & { readonly __brand: "TableId" };

export function asTableId(raw: string): TableId {
  return raw as TableId;
}

/** The long axis follows the player's nearest quarter turn. */
export function tableYaw(playerYaw: number): number {
  const snapped = Math.round((playerYaw + 180) / 90) * 90;
  const yaw = ((snapped % 360) + 360) % 360;
  return yaw > 180 ? yaw - 360 : yaw;
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
