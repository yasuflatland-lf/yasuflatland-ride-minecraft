import type { BuildSession } from "../session";
import { shapeOf, stylesFor } from "../shape/shape";
import {
  type FillStyle,
  fillStylesFor,
  type HeightedKind,
  isBoxStepKind,
} from "../volume/kind";
import type { BuildFlow } from "./flow";

export type ShapeEntryId =
  | "place"
  | "fill"
  | "frame"
  | "faces"
  | "walls"
  | Exclude<HeightedKind, "sideCylinderX" | "sideCylinderZ">
  | "sideCylinder"
  | "fillBelow"
  | "removeAbove"
  | "cut"
  | "copy"
  | "rotate"
  | "cancel";
export type ContentsEntryId = FillStyle | "cancel";
export type TerrainEntryId = "confirm" | "cancel";
export type UtilityEntryId = "copy" | "undo" | "clear";

export type PasteEntryId = "undo" | "rotate" | "newCopy" | "endPaste";

export interface MenuEntry<Id extends string = string> {
  id: Id;
  on?: boolean;
}

const RECT_SOLID_ENTRIES: readonly ShapeEntryId[] = [
  "gable",
  "hip",
  "cylinder",
  "sideCylinder",
  "sphere",
  "cube",
];
const BOX_SOLID_ENTRIES: readonly ShapeEntryId[] = [
  "cylinder",
  "sideCylinder",
  "sphere",
];

export function shapeMenu(flow: BuildFlow): MenuEntry<ShapeEntryId>[] {
  if (flow.kind !== "endpoint") return [];
  const shape = shapeOf(flow.from, flow.to);
  const extraEntries: readonly ShapeEntryId[] =
    shape.kind === "rect" && shape.flat === "y"
      ? RECT_SOLID_ENTRIES
      : shape.kind === "box"
        ? BOX_SOLID_ENTRIES
        : [];
  return [
    ...stylesFor(shape).map<MenuEntry<ShapeEntryId>>((style) => ({
      id: shape.kind === "line" ? "place" : style,
    })),
    ...extraEntries.map((id) => ({ id })),
    { id: "fillBelow" },
    { id: "removeAbove" },
    { id: "cut" },
    { id: "copy" },
    { id: "rotate" },
    { id: "cancel" },
  ];
}

export function utilityMenu(
  session: BuildSession,
): MenuEntry<UtilityEntryId>[] {
  const entries: MenuEntry<UtilityEntryId>[] = [];
  if (session.confirmedBox) entries.push({ id: "copy" });
  if (session.hasHistory) entries.push({ id: "undo" });
  if (session.flow.kind !== "idle" || session.confirmedBox)
    entries.push({ id: "clear" });
  return entries;
}

export function contentsMenu(flow: BuildFlow): MenuEntry<ContentsEntryId>[] {
  return flow.kind === "heightStep" && !isBoxStepKind(flow.heightedKind)
    ? [
        ...fillStylesFor(flow.heightedKind).map((id) => ({ id })),
        { id: "cancel" },
      ]
    : [];
}

export function terrainMenu(flow: BuildFlow): MenuEntry<TerrainEntryId>[] {
  return flow.kind === "terrainConfirm"
    ? [{ id: "confirm" }, { id: "cancel" }]
    : [];
}

export function pasteMenu(input: {
  hasHistory: boolean;
}): MenuEntry<PasteEntryId>[] {
  return [
    ...(input.hasHistory ? [{ id: "undo" as const }] : []),
    { id: "rotate" },
    { id: "newCopy" },
    { id: "endPaste" },
  ];
}
