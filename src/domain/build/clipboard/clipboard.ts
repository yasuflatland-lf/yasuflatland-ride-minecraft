// Clipboard cells are relative to the minimum corner.
import type { Cell } from "../../shared/cells";
import type { BlockState } from "../blockState";
import { type Box, boxOf, cellsOf } from "../box";
import { isKeptState } from "../edit/guard";

interface ClipboardCell {
  /** Relative to the box min. */
  readonly at: Cell;
  readonly state: BlockState;
}

export interface Clipboard {
  readonly size: Cell;
  readonly cells: readonly ClipboardCell[];
}

/** A cell that reads undefined or is kept is left out, so a paste leaves that target cell as it is. */
export function clipboardOf(
  box: Box,
  read: (cell: Cell) => BlockState | undefined,
): Clipboard {
  const cells: ClipboardCell[] = [];
  for (const cell of cellsOf(box)) {
    const state = read(cell);
    if (!state || isKeptState(state)) continue;
    cells.push({
      at: {
        x: cell.x - box.min.x,
        y: cell.y - box.min.y,
        z: cell.z - box.min.z,
      },
      state,
    });
  }
  return {
    size: {
      x: box.max.x - box.min.x + 1,
      y: box.max.y - box.min.y + 1,
      z: box.max.z - box.min.z + 1,
    },
    cells,
  };
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
function pasteBox(clipboard: Clipboard, anchor: Cell): Box {
  return boxOf(anchor, {
    x: anchor.x + clipboard.size.x - 1,
    y: anchor.y + clipboard.size.y - 1,
    z: anchor.z + clipboard.size.z - 1,
  });
}

export type PasteTarget = { anchor: Cell; box: Box };

export function pasteTarget(
  clipboard: Clipboard,
  block: Cell,
  face: Face,
): PasteTarget {
  const anchor = anchorCell(block, face);
  return { anchor, box: pasteBox(clipboard, anchor) };
}

export function aimedPasteTarget(
  clipboard: Clipboard,
  aim: { block?: { cell: Cell; face: Face } },
): PasteTarget | undefined {
  return aim.block
    ? pasteTarget(clipboard, aim.block.cell, aim.block.face)
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
