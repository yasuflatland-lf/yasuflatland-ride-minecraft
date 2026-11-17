import type { Cell } from "../../shared/cells";
import { anchorCell, type Face } from "../aim/face";
import type { CellBox, Size } from "../box";
import { type Facing, turnBetween } from "../rotation/facing";
import { type QuarterTurn, rotatedSize } from "../rotation/quarterTurn";
import type { StructureHandle } from "../structure/handle";
import { placedPasteBox } from "./placement";

export interface Clipboard {
  readonly facing: Facing;
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
  facing: Facing,
): PasteTarget {
  const turn = turnBetween(clipboard.facing, facing);
  const size = rotatedSize(clipboard.size, turn);
  const box = placedPasteBox(anchorCell(block, face), size, facing, face);
  return { anchor: box.min, box, turn };
}

export function aimedPasteTarget(
  clipboard: Clipboard,
  aim: { block?: { cell: Cell; face: Face } },
  facing: Facing,
): PasteTarget | undefined {
  return aim.block
    ? pasteTarget(clipboard, aim.block.cell, aim.block.face, facing)
    : undefined;
}
