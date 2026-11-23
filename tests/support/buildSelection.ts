import type { BlockState } from "../../src/domain/build/blockState";
import { sizeOf } from "../../src/domain/build/box";
import {
  chooseHeighted,
  confirmLiveHeight,
  tapAir,
  tapBlock,
} from "../../src/domain/build/flow/heightFlow";
import {
  chooseStairs,
  fixStairGoal,
} from "../../src/domain/build/flow/stairFlow";
import type {
  BaseHeightFlow,
  BuildFlow,
} from "../../src/domain/build/flow/state";
import { chooseTerrain } from "../../src/domain/build/flow/terrainFlow";
import type { Cell } from "../../src/domain/shared/cells";
import type { DimensionId } from "../../src/domain/shared/ids";

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
    chooseHeighted(selected, "hip"),
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

export function confirmEndpointHeight(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "baseHeight") return flow;
  const original: BaseHeightFlow = {
    ...flow,
    previous: sizeOf(flow.selection.box).y,
  };
  return confirmLiveHeight(original);
}
