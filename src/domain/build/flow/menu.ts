import type { BuildSession } from "../session";
import { shapeOf, stylesFor } from "../shape/shape";
import { type FillStyle, fillStylesFor } from "../volume/kind";
import type { BuildFlow } from "./flow";

export type ShapeEntryId =
  | "place"
  | "fill"
  | "frame"
  | "faces"
  | "walls"
  | "gable"
  | "hip"
  | "cylinder"
  | "cube"
  | "copy"
  | "cancel";
export type ContentsEntryId = FillStyle | "cancel";
export type UtilityEntryId = "copy" | "paste" | "undo" | "clear";

export interface MenuEntry<Id extends string = string> {
  id: Id;
}

export function shapeMenu(flow: BuildFlow): MenuEntry<ShapeEntryId>[] {
  if (flow.kind !== "endpoint") return [];
  const shape = shapeOf(flow.from, flow.to);
  const extraEntries: MenuEntry<ShapeEntryId>[] =
    shape.kind === "rect" && shape.flat === "y"
      ? [{ id: "gable" }, { id: "hip" }, { id: "cylinder" }, { id: "cube" }]
      : shape.kind === "box"
        ? [{ id: "cylinder" }]
        : [];
  return [
    ...stylesFor(shape).map<MenuEntry<ShapeEntryId>>((style) => ({
      id: shape.kind === "line" ? "place" : style,
    })),
    ...extraEntries,
    { id: "copy" },
    { id: "cancel" },
  ];
}

export function utilityMenu(
  session: BuildSession,
): MenuEntry<UtilityEntryId>[] {
  const entries: MenuEntry<UtilityEntryId>[] = [];
  if (session.confirmedBox) entries.push({ id: "copy" });
  if (session.clipboard) entries.push({ id: "paste" });
  if (session.hasHistory) entries.push({ id: "undo" });
  if (session.flow.kind !== "idle" || session.confirmedBox)
    entries.push({ id: "clear" });
  return entries;
}

export function contentsMenu(flow: BuildFlow): MenuEntry<ContentsEntryId>[] {
  return flow.kind === "heightStep" && flow.heightedKind !== "copy"
    ? [
        ...fillStylesFor(flow.heightedKind).map((id) => ({ id })),
        { id: "cancel" },
      ]
    : [];
}
