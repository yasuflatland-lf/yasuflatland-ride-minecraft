import { anchorCell, type BlockFace } from "../../shared/blockFace";
import type { Cell } from "../../shared/cells";
import type { BlockState } from "../blockState";
import { type CellBox, type Size, sizeOf, volume } from "../box";
import type { Facing } from "../rotation/facing";
import { type QuarterTurn, rotatedSize } from "../rotation/quarterTurn";
import type { Selection } from "../selection";
import type { StructureHandle } from "../structure/handle";
import {
  type AnchorCorner,
  anchorCornerOf,
  boxAtCorner,
  turnCorner,
} from "./anchorCorner";

export interface Clipboard {
  readonly anchor: AnchorCorner;
  readonly material: BlockState;
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

export function clipboardOf({
  selection,
  facing,
  handle,
  point1,
}: {
  point1?: Cell;
  selection: Selection;
  facing: Facing;
  handle: StructureHandle;
}): Clipboard {
  return {
    anchor: anchorCornerOf(selection.box, point1, facing),
    material: selection.material,
    facing,
    size: sizeOf(selection.box),
    blockCount: volume(selection.box),
    contents: { kind: "structure", handle },
  };
}

export function structureOf(
  clipboard: Clipboard | undefined,
): StructureHandle | undefined {
  return clipboard?.contents.handle;
}

export type PasteTarget = {
  anchor: Cell;
  corner: Cell;
  box: CellBox;
  turn: QuarterTurn;
};

export function pasteTarget(
  clipboard: Clipboard,
  block: Cell,
  face: BlockFace,
  turn: QuarterTurn,
): PasteTarget {
  const size = rotatedSize(clipboard.size, turn);
  const corner = anchorCell(block, face);
  const box = boxAtCorner(corner, size, turnCorner(clipboard.anchor, turn));
  return { anchor: box.min, corner, box, turn };
}

export function aimedPasteTarget(
  clipboard: Clipboard,
  aim: { block?: { cell: Cell; face: BlockFace } },
  turn: QuarterTurn,
): PasteTarget | undefined {
  return aim.block
    ? pasteTarget(clipboard, aim.block.cell, aim.block.face, turn)
    : undefined;
}
