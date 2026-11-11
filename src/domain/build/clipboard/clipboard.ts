import type { Cell } from "../../shared/cells";
import { anchorCell, type Face } from "../aim/face";
import { boxFromSize, type CellBox, type Size } from "../box";
import {
  NO_TURN,
  type QuarterTurn,
  rotatedSize,
} from "../rotation/quarterTurn";
import type { StructureHandle } from "../structure/handle";

export interface Clipboard {
  /** Box dimensions. */
  readonly size: Size;
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
    box: boxFromSize(anchor, rotatedSize(clipboard.size, turn)),
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
