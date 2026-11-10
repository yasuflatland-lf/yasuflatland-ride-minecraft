import type { Cell } from "../../shared/cells";
import { boxOf, type CellBox } from "../box";
import {
  NO_TURN,
  type QuarterTurn,
  rotatedSize,
} from "../rotation/quarterTurn";
import type { StructureHandle } from "../structure/handle";

export interface Clipboard {
  /** Box dimensions. */
  readonly size: Cell;
  /** What the "copied" and paste hint messages show. */
  readonly blockCount: number;
  readonly contents: {
    readonly kind: "structure";
    readonly handle: StructureHandle;
  };
}

export function structureOf(
  clipboard: Clipboard | undefined,
): StructureHandle | undefined {
  return clipboard?.contents.handle;
}

export type Face = "up" | "down" | "north" | "south" | "east" | "west";

function anchorCell(block: Cell, face: Face): Cell {
  const offsets: Record<Face, Cell> = {
    up: { x: 0, y: 1, z: 0 },
    down: { x: 0, y: -1, z: 0 },
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
  };
  const offset = offsets[face];
  return {
    x: block.x + offset.x,
    y: block.y + offset.y,
    z: block.z + offset.z,
  };
}
function pasteBox(size: Cell, anchor: Cell): CellBox {
  return boxOf(anchor, {
    x: anchor.x + size.x - 1,
    y: anchor.y + size.y - 1,
    z: anchor.z + size.z - 1,
  });
}

export type PasteTarget = { anchor: Cell; box: CellBox; turn: QuarterTurn };

export function pasteTarget(
  clipboard: Clipboard,
  block: Cell,
  face: Face,
  turn: QuarterTurn = NO_TURN,
): PasteTarget {
  const anchor = anchorCell(block, face);
  return {
    anchor,
    box: pasteBox(rotatedSize(clipboard.size, turn), anchor),
    turn,
  };
}

export function aimedPasteTarget(
  clipboard: Clipboard,
  aim: { block?: { cell: Cell; face: Face } },
  turn: QuarterTurn = NO_TURN,
): PasteTarget | undefined {
  return aim.block
    ? pasteTarget(clipboard, aim.block.cell, aim.block.face, turn)
    : undefined;
}

export function parseFace(value: string): Face | undefined {
  const face = value.toLowerCase();
  switch (face) {
    case "up":
    case "down":
    case "north":
    case "south":
    case "east":
    case "west":
      return face;
    default:
      return undefined;
  }
}
