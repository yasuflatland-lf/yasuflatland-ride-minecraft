import { boxOf, sameBox } from "../box";
import type { StairOp } from "../stairs/contents";
import { type StairRow, stairRowOf } from "../stairs/row";
import type { Staircase } from "../stairs/staircase";
import type { BuildFlow } from "./state";

export function selectedStairRow(
  flow: Extract<BuildFlow, { kind: "selected" }>,
): StairRow | undefined {
  const row = stairRowOf(flow);
  return row && sameBox(boxOf(row.min, row.max), flow.selection.box)
    ? row
    : undefined;
}

export function chooseStairs(flow: BuildFlow, op: StairOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const taps = { from: flow.from, to: flow.to };
  const row = selectedStairRow(flow);
  if (!row) return flow;
  const { dimensionId, material, box } = flow.selection;
  return Object.freeze({
    kind: "stairAim",
    op,
    dimensionId,
    row,
    taps,
    material,
    selectionBefore: box,
  });
}

export function fixStairGoal(flow: BuildFlow, staircase: Staircase): BuildFlow {
  if (flow.kind !== "stairAim") return flow;
  const { dimensionId, taps, material, selectionBefore } = flow;
  return Object.freeze({
    kind: "stairContents",
    op: flow.op,
    dimensionId,
    staircase,
    taps,
    material,
    selectionBefore,
  });
}
