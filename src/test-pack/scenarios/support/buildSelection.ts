import type { CellBox } from "../../../domain/build/box";
import type { BuildFlow } from "../../../domain/build/flow/state";

export function selectionBoxOf(flow: BuildFlow): CellBox | undefined {
  return flow.kind === "selected" ? flow.selection.box : undefined;
}
