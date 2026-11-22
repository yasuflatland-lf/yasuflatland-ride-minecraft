import type { BuildFlow } from "./flow";

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
