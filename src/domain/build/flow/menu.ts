import type { BuildSession } from "../session";
import { shapeOf, stylesFor } from "../shape/shape";
import type { BuildFlow } from "./flow";

export interface MenuEntry {
  id: string;
}

export function shapeMenu(flow: BuildFlow): MenuEntry[] {
  if (flow.kind !== "endpoint") return [];
  const shape = shapeOf(flow.from, flow.to);
  return [
    ...stylesFor(shape).map((style) => ({
      id: shape.kind === "line" ? "place" : style,
    })),
    ...(shape.kind === "rect" && shape.flat === "y"
      ? [{ id: "gable" }, { id: "hip" }]
      : []),
    { id: "cancel" },
  ];
}

export function utilityMenu(session: BuildSession): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (session.confirmedBox) entries.push({ id: "copy" });
  if (session.clipboard) entries.push({ id: "paste" });
  if (session.hasHistory) entries.push({ id: "undo" });
  if (session.flow.kind !== "idle" || session.confirmedBox)
    entries.push({ id: "clear" });
  return entries;
}

export function roofMenu(flow: BuildFlow): MenuEntry[] {
  return flow.kind === "roofHeight"
    ? [{ id: "fill" }, { id: "hollow" }, { id: "cancel" }]
    : [];
}
