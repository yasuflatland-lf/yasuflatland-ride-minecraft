import { boxOf, sameBox } from "../box";
import type { StairOp } from "../stairs/contents";
import { type StairRow, stairRowOf } from "../stairs/row";
import type { Staircase } from "../stairs/staircase";
import type { SelectedFlow } from "./selectedFlow";
import type { BuildFlow } from "./state";

export function selectedStairRow(flow: SelectedFlow): StairRow | undefined {
  const row = stairRowOf(flow.taps);
  return row && sameBox(boxOf(row.min, row.max), flow.selection.box)
    ? row
    : undefined;
}

export function chooseStairs(flow: BuildFlow, op: StairOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const row = selectedStairRow(flow);
  if (!row) return flow;
  return Object.freeze({
    kind: "stairAim",
    op,
    start: flow.start,
    row,
    taps: flow.taps,
    selectionBefore: flow.selection.box,
  });
}

export function fixStairGoal(flow: BuildFlow, staircase: Staircase): BuildFlow {
  if (flow.kind !== "stairAim") return flow;
  const { op, start, taps, selectionBefore } = flow;
  return Object.freeze({
    kind: "stairContents",
    op,
    start,
    staircase,
    taps,
    selectionBefore,
  });
}
