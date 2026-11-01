import type { BuildSession } from "../session";
import { shapeOf, stylesFor } from "../shape/shape";
import { fillStylesFor } from "../volume/kind";
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
      ? [{ id: "gable" }, { id: "hip" }, { id: "cylinder" }, { id: "cube" }]
      : shape.kind === "box"
        ? [{ id: "cylinder" }]
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

export function contentsMenu(flow: BuildFlow): MenuEntry[] {
  return flow.kind === "heightStep"
    ? [
        ...fillStylesFor(flow.heightedKind).map((id) => ({ id })),
        { id: "cancel" },
      ]
    : [];
}
