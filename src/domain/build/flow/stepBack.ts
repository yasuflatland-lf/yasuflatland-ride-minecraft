import { type BuildFlow, point1 } from "./state";

export type SelectionStep = "end" | "start";

export function stepBackSelection(
  flow: BuildFlow,
): { readonly flow: BuildFlow; readonly cleared: SelectionStep } | undefined {
  if ((flow.kind === "baseHeight" || flow.kind === "selected") && flow.freshEnd)
    return { flow: point1(flow.start), cleared: "end" };
  if (flow.kind === "point1")
    return { flow: { kind: "idle" }, cleared: "start" };
}

export function withoutStepBack(flow: BuildFlow): BuildFlow {
  if (
    (flow.kind !== "baseHeight" && flow.kind !== "selected") ||
    !flow.freshEnd
  )
    return flow;
  const { freshEnd: _, ...confirmed } = flow;
  return Object.freeze(confirmed);
}

export function cancel(_flow: BuildFlow): BuildFlow {
  return Object.freeze({ kind: "idle" });
}

export function backToAiming(flow: BuildFlow): BuildFlow {
  switch (flow.kind) {
    case "heightStep":
    case "stairAim":
    case "stairContents":
    case "terrainConfirm":
      return point1(flow.start);
    default:
      return flow;
  }
}
