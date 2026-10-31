// Lazy edit plans, so a 100,000-cell edit is never held in memory at once.
// Planning does not filter protected or kept cells; the edit job does, when it
// reads each `before`.
import type { Cell } from "../../shared/cells";
import { type Clipboard, pasteBox } from "../clipboard/clipboard";
import { type RoofSpec, roofCells } from "../roof/roof";
import { cellsOfShape, type Shape, type ShapeStyle } from "../shape/shape";
import type { PlannedChange } from "./change";
import type { Pattern } from "./pattern";

export function* planShape(
  shape: Shape,
  style: ShapeStyle,
  pattern: Pattern,
): Iterable<PlannedChange> {
  for (const cell of cellsOfShape(shape, style))
    yield { cell, after: pattern.state };
}

export function* planPaste(
  clipboard: Clipboard,
  anchor: Cell,
  skipAir: boolean,
): Iterable<PlannedChange> {
  const { min } = pasteBox(clipboard, anchor);
  for (const { at, state } of clipboard.cells) {
    if (skipAir && state.typeId === "minecraft:air") continue;
    yield {
      cell: { x: min.x + at.x, y: min.y + at.y, z: min.z + at.z },
      after: state,
    };
  }
}

export function* planRoof(
  spec: RoofSpec,
  hollow: boolean,
  pattern: Pattern,
): Iterable<PlannedChange> {
  for (const cell of roofCells(spec, hollow))
    yield { cell, after: pattern.state };
}
