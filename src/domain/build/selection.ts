import type { DimensionId } from "../shared/ids";
import type { BlockState } from "./blockState";
import { boxOf, type CellBox } from "./box";
import type { BuildFlow } from "./flow/flow";

export type Selection = Readonly<{
  dimensionId: DimensionId;
  box: CellBox;
  material: BlockState;
}>;

export function selectionOf(
  dimensionId: DimensionId,
  box: CellBox,
  material: BlockState,
): Selection {
  return Object.freeze({
    dimensionId,
    box: Object.freeze({
      min: Object.freeze({ ...box.min }),
      max: Object.freeze({ ...box.max }),
    }),
    material,
  });
}

export function withBox(selection: Selection, box: CellBox): Selection {
  return selectionOf(selection.dimensionId, box, selection.material);
}

export function inDimension(
  selection: Selection,
  dimensionId: DimensionId,
): boolean {
  return selection.dimensionId === dimensionId;
}

export function endpointSelection(
  flow: Extract<BuildFlow, { kind: "endpoint" }>,
): Selection {
  return selectionOf(
    flow.dimensionId,
    boxOf(flow.from, flow.to),
    flow.material,
  );
}
