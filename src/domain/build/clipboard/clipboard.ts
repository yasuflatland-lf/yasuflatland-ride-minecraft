import { anchorCell, type BlockFace } from "../../shared/blockFace";
import type { Cell } from "../../shared/cells";
import type { BlockState } from "../blockState";
import { type CellBox, type Size, sizeOf, volume } from "../box";
import type { Facing } from "../rotation/facing";
import { type QuarterTurn, rotatedSize } from "../rotation/quarterTurn";
import type { Selection } from "../selection";
import type { StructureHandle } from "../structure/handle";
import { placedPasteBox } from "./placement";

export interface Clipboard {
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
}: {
  selection: Selection;
  facing: Facing;
  handle: StructureHandle;
}): Clipboard {
  return {
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

export type PasteTarget = { anchor: Cell; box: CellBox; turn: QuarterTurn };

export function pasteTarget(
  clipboard: Clipboard,
  block: Cell,
  face: BlockFace,
  turn: QuarterTurn,
  facing: Facing,
): PasteTarget {
  const size = rotatedSize(clipboard.size, turn);
  const box = placedPasteBox(anchorCell(block, face), size, facing, face);
  return { anchor: box.min, box, turn };
}

export function aimedPasteTarget(
  clipboard: Clipboard,
  aim: { block?: { cell: Cell; face: BlockFace } },
  turn: QuarterTurn,
  facing: Facing,
): PasteTarget | undefined {
  return aim.block
    ? pasteTarget(clipboard, aim.block.cell, aim.block.face, turn, facing)
    : undefined;
}
