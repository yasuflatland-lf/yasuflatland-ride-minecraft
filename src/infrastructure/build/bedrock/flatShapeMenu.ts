import type { BuildFlow } from "../../../domain/build/flow/flow";
import {
  buildEntries,
  editEntries,
  type MenuEntry,
  type ShapeEntryId,
} from "../../../domain/build/flow/menu";
import { shapeOf } from "../../../domain/build/shape/shape";

// Preserve the existing forms until the two-level Bedrock UI lands in #1960.
export function flatShapeMenu(flow: BuildFlow): MenuEntry<ShapeEntryId>[] {
  if (flow.kind !== "endpoint") return [];
  const edits = editEntries();
  return [
    ...edits.slice(0, 3),
    ...buildEntries(shapeOf(flow.from, flow.to)),
    ...edits.slice(3),
    { id: "cancel" },
  ];
}
