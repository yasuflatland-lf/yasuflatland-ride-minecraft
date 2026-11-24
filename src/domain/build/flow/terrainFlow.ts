import type { TerrainOp } from "../terrain/area";
import type { BuildFlow } from "./state";

export function chooseTerrain(flow: BuildFlow, op: TerrainOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  return Object.freeze({
    kind: "terrainConfirm",
    selection: flow.selection,
    from: flow.from,
    to: flow.to,
    op,
  });
}
