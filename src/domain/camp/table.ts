import { type Cell, cellOf } from "../shared/cells";
import { facePlayer } from "../shared/facing";
import {
  footprintClearCells,
  footprintOffsets,
  footprintOrigin,
} from "../shared/gearFootprint";
import type { Brand } from "../shared/ids";
import { add3, type Vec3 } from "../shared/vec";
import { TABLE_SPEC } from "./spec";

export type TableId = Brand<string, "TableId">;

export function asTableId(raw: string): TableId {
  return raw as TableId;
}

/** The long axis follows the player's nearest quarter turn. */
export function tableYaw(playerYaw: number): number {
  return facePlayer(playerYaw);
}

function tableOffsets(yaw: number) {
  const alongX = Math.abs(yaw) % 180 === 0;
  return footprintOffsets(
    TABLE_SPEC.cells,
    alongX ? { x: 1, z: 0 } : { x: 0, z: 1 },
  );
}

/** The clicked ground cell and its neighbor under the other end. */
export function tableCells(clicked: Cell, yaw: number): Cell[] {
  return tableOffsets(yaw).map((offset) =>
    cellOf(add3(clicked, { ...offset, y: 0 })),
  );
}

export function tableOrigin(clicked: Cell, yaw: number): Vec3 {
  return footprintOrigin(clicked, tableOffsets(yaw));
}

export function tableClearCells(clicked: Cell, yaw: number): Cell[] {
  const floor = tableCells(clicked, yaw).map((cell) =>
    cellOf({
      ...cell,
      y: cell.y + 1,
    }),
  );
  return footprintClearCells(floor, TABLE_SPEC.clearance, "column");
}
