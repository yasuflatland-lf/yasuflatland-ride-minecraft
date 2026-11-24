import type { Cell } from "../shared/cells";
import type { BuildFlow } from "./flow/state";

export function endMarkerCell(
  flow: BuildFlow,
  aimedEnd: Cell | undefined,
): Cell | undefined {
  switch (flow.kind) {
    case "point1":
      return aimedEnd;
    case "baseHeight":
    case "selected":
    case "terrainConfirm":
      return flow.taps.to;
    default:
      return undefined;
  }
}

export function tapTargetCell(
  flow: BuildFlow,
  aimedEnd: Cell | undefined,
): Cell | undefined {
  return flow.kind === "terrainConfirm"
    ? undefined
    : endMarkerCell(flow, aimedEnd);
}
