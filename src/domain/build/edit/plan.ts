// Lazy edit plans, so a 100,000-cell edit is never held in memory at once.
// Planning does not filter protected or kept cells; the edit job does, when it
// reads each `before`.
import type { Cell } from "../../shared/cells";
import type { BlockState } from "../blockState";
import { type Box, cellsOf } from "../box";
import { type Clipboard, pasteBox } from "../clipboard/clipboard";
import type { PlannedChange } from "./change";
import { type Mask, matches, type Pattern } from "./pattern";

export function* planFill(box: Box, pattern: Pattern): Iterable<PlannedChange> {
  for (const cell of cellsOf(box)) yield { cell, after: pattern.state };
}

export function* planReplace(
  box: Box,
  mask: Mask,
  pattern: Pattern,
  read: (cell: Cell) => BlockState | undefined,
): Iterable<PlannedChange> {
  for (const cell of cellsOf(box)) {
    const state = read(cell);
    if (state && matches(mask, state)) yield { cell, after: pattern.state };
  }
}

export function* planPaste(
  clipboard: Clipboard,
  feet: Cell,
  skipAir: boolean,
): Iterable<PlannedChange> {
  const { min } = pasteBox(clipboard, feet);
  for (const { at, state } of clipboard.cells) {
    if (skipAir && state.typeId === "minecraft:air") continue;
    yield {
      cell: { x: min.x + at.x, y: min.y + at.y, z: min.z + at.z },
      after: state,
    };
  }
}
