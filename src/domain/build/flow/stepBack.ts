import type { BuildFlow } from "./state";

export type SelectionStep = "end" | "start";

export function stepBackSelection(
  flow: BuildFlow,
): { readonly flow: BuildFlow; readonly cleared: SelectionStep } | undefined {
  if (
    (flow.kind === "baseHeight" || flow.kind === "selected") &&
    flow.stepBackTo
  )
    return { flow: flow.stepBackTo, cleared: "end" };
  if (flow.kind === "point1")
    return { flow: { kind: "idle" }, cleared: "start" };
}

export function withoutStepBack(flow: BuildFlow): BuildFlow {
  if (
    (flow.kind !== "baseHeight" && flow.kind !== "selected") ||
    !flow.stepBackTo
  )
    return flow;
  const { stepBackTo: _, ...confirmed } = flow;
  return Object.freeze(confirmed);
}

export function cancel(_flow: BuildFlow): BuildFlow {
  return Object.freeze({ kind: "idle" });
}

export function backToAiming(flow: BuildFlow): BuildFlow {
  if (flow.kind === "heightStep")
    return Object.freeze({
      kind: "point1",
      dimensionId: flow.dimensionId,
      cell: flow.from,
      material: flow.material,
    });
  if (flow.kind === "stairAim" || flow.kind === "stairContents")
    return Object.freeze({
      kind: "point1",
      dimensionId: flow.dimensionId,
      cell: flow.taps.from,
      material: flow.material,
    });
  return flow.kind === "terrainConfirm"
    ? Object.freeze({
        kind: "point1",
        dimensionId: flow.selection.dimensionId,
        cell: flow.from,
        material: flow.selection.material,
      })
    : flow;
}
