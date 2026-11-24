import type { BlockState } from "../../src/domain/build/blockState";
import { sizeOf } from "../../src/domain/build/box";
import {
  tapAir as applyAirTap,
  tapBlock as applyBlockTap,
  chooseHeighted,
  confirmLiveHeight,
} from "../../src/domain/build/flow/heightFlow";
import {
  chooseStairs,
  fixStairGoal,
} from "../../src/domain/build/flow/stairFlow";
import type {
  BaseHeightFlow,
  BuildFlow,
  HeightStepFlow,
} from "../../src/domain/build/flow/state";
import { chooseTerrain } from "../../src/domain/build/flow/terrainFlow";
import type { Selection } from "../../src/domain/build/selection";
import type { HeightStepKind } from "../../src/domain/build/volume/kind";
import type { Cell } from "../../src/domain/shared/cells";
import type { DimensionId } from "../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../helpers/buildHeightRange";

export function tapBlock(
  flow: BuildFlow,
  dimensionId: DimensionId,
  cell: Cell,
  material: BlockState,
  range = OVERWORLD_RANGE,
): BuildFlow {
  return applyBlockTap(flow, dimensionId, cell, material, range);
}

export function tapAir(
  flow: BuildFlow,
  end?: Cell,
  range = OVERWORLD_RANGE,
): BuildFlow {
  return applyAirTap(flow, end, range);
}

export function selectionFlows(
  from: Cell,
  dimensionId: DimensionId,
  material: BlockState,
) {
  const point1 = tapBlock({ kind: "idle" }, dimensionId, from, material);
  const baseHeight = tapAir(point1, { ...from, x: from.x + 1, z: from.z + 1 });
  const selected = confirmEndpointHeight(baseHeight);
  const stairAim = chooseStairs(
    tapAir(point1, { ...from, x: from.x + 1 }),
    "stairs",
  );
  if (stairAim.kind !== "stairAim") throw new Error("Expected stair row");
  const inProgress = [
    point1,
    baseHeight,
    chooseHeightedFlow(selected, "hip"),
    stairAim,
    fixStairGoal(stairAim, {
      row: stairAim.row,
      toward: "north",
      run: 1,
      rise: 1,
    }),
    chooseTerrain(selected, "fillBelow"),
  ];
  return { selected, inProgress };
}

export function chooseHeightedFlow(
  flow: BuildFlow,
  kind: HeightStepKind,
): HeightStepFlow {
  const result = chooseHeighted(flow, kind, OVERWORLD_RANGE);
  if ("refused" in result)
    throw new Error(`Expected height step for ${kind}: ${result.refused}`);
  return result.flow;
}

export function confirmEndpointHeight(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "baseHeight") return flow;
  const original: BaseHeightFlow = {
    ...flow,
    liveHeight: sizeOf(flow.selection.box).y,
  };
  return confirmLiveHeight(original);
}

export function tappedSelection(selection: Selection, from: Cell, to: Cell) {
  const { dimensionId, material } = selection;
  return {
    selection,
    start: { dimensionId, cell: from, material },
    taps: { from, to },
  };
}
