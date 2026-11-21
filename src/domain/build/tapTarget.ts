import type { Cell } from "../shared/cells";
import type { BuildFlow } from "./flow/flow";

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
      return flow.to;
    default:
      return undefined;
  }
}

/** @public Temporary Knip exception until tap target placement and input use this export (#2208, #2209). */
export function tapTargetCell(
  flow: BuildFlow,
  aimedEnd: Cell | undefined,
): Cell | undefined {
  return flow.kind === "terrainConfirm"
    ? undefined
    : endMarkerCell(flow, aimedEnd);
}
