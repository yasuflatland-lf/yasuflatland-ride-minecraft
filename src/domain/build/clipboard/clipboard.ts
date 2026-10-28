// A copied box, remembered relative to where the player stood.
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
  /** box.min - feet at copy time. */
  readonly offset: Cell;
  readonly size: Cell;
  readonly cells: readonly ClipboardCell[];
}

/** A cell that reads undefined or is kept is left out, so a paste leaves that target cell as it is. */
export function clipboardOf(
  box: Box,
  feet: Cell,
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
    offset: {
      x: box.min.x - feet.x,
      y: box.min.y - feet.y,
      z: box.min.z - feet.z,
    },
    size: {
      x: box.max.x - box.min.x + 1,
      y: box.max.y - box.min.y + 1,
      z: box.max.z - box.min.z + 1,
    },
    cells,
  };
}

export function pasteBox(clipboard: Clipboard, feet: Cell): Box {
  const min = {
    x: feet.x + clipboard.offset.x,
    y: feet.y + clipboard.offset.y,
    z: feet.z + clipboard.offset.z,
  };
  return boxOf(min, {
    x: min.x + clipboard.size.x - 1,
    y: min.y + clipboard.size.y - 1,
    z: min.z + clipboard.size.z - 1,
  });
}
