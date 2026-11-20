import type { BuildSession } from "../session";
import { type Shape, shapeOf, stylesFor } from "../shape/shape";
import type { StairContents } from "../stairs/contents";
import {
  type FillStyle,
  fillStylesFor,
  type HeightedKind,
} from "../volume/kind";
import { type BuildFlow, selectedStairRow } from "./flow";

export type EditEntryId = "cut" | "removeAbove" | "fillBelow" | "copy";
export type BuildEntryId =
  | "place"
  | "fill"
  | "frame"
  | "faces"
  | "walls"
  | Exclude<HeightedKind, "sideCylinderX" | "sideCylinderZ">
  | "sideCylinder";
export type RootEntryId =
  | EditEntryId
  | "adjustHeight"
  | "stairs"
  | "buildShape"
  | "place"
  | "cancel";
export type BuildMenuEntryId = BuildEntryId | "back";
/** What a shape-menu (root or build level) entry asks for. */
export type ShapeChoice =
  | { readonly kind: "stairs" }
  | { readonly kind: "adjustHeight" }
  | { readonly kind: "openBuild" }
  | { readonly kind: "closeBuild" }
  | { readonly kind: "edit"; readonly id: EditEntryId }
  | { readonly kind: "build"; readonly id: BuildEntryId }
  | { readonly kind: "cancel" };

export type ContentsEntryId = FillStyle | "cancel";
export type TerrainEntryId = "confirm" | "cancel";
export type UtilityEntryId = "copy" | "undo" | "clear";

export type PasteEntryId = "newCopy" | "endPaste" | "cancel";

export interface MenuEntry<Id extends string = string> {
  id: Id;
  on?: boolean;
}

const HEIGHTED_ENTRIES: readonly BuildEntryId[] = [
  "gable",
  "hip",
  "cylinder",
  "sideCylinder",
  "sphere",
  "cube",
];

export function buildEntries(shape: Shape): MenuEntry<BuildEntryId>[] {
  const extraEntries: readonly BuildEntryId[] =
    shape.kind === "box" || (shape.kind === "rect" && shape.flat === "y")
      ? HEIGHTED_ENTRIES
      : [];
  return [
    ...stylesFor(shape).map<MenuEntry<BuildEntryId>>((style) => ({
      id: shape.kind === "line" ? "place" : style,
    })),
    ...extraEntries.map((id) => ({ id })),
  ];
}

export function shapeChoiceOf(id: RootEntryId | BuildMenuEntryId): ShapeChoice {
  switch (id) {
    case "stairs":
    case "adjustHeight":
    case "cancel":
      return { kind: id };
    case "buildShape":
      return { kind: "openBuild" };
    case "back":
      return { kind: "closeBuild" };
    case "cut":
    case "removeAbove":
    case "fillBelow":
    case "copy":
      return { kind: "edit", id };
    case "place":
    case "fill":
    case "frame":
    case "faces":
    case "walls":
    case "gable":
    case "hip":
    case "cylinder":
    case "sideCylinder":
    case "sphere":
    case "cube":
      return { kind: "build", id };
  }
}

export function shapeMenu(flow: BuildFlow): MenuEntry<RootEntryId>[] {
  if (flow.kind !== "selected" || flow.menuLevel !== "root") return [];
  const { min, max } = flow.selection.box;
  const isLine = shapeOf(min, max).kind === "line";
  return [
    ...(isLine ? [] : [{ id: "adjustHeight" as const }]),
    { id: "cut" },
    { id: "removeAbove" },
    { id: isLine ? "place" : "buildShape" },
    ...(selectedStairRow(flow) ? [{ id: "stairs" as const }] : []),
    { id: "copy" },
    { id: "fillBelow" },
    { id: "cancel" },
  ];
}

export function buildMenu(flow: BuildFlow): MenuEntry<BuildMenuEntryId>[] {
  if (flow.kind !== "selected" || flow.menuLevel !== "build") return [];
  return [
    ...buildEntries(shapeOf(flow.selection.box.min, flow.selection.box.max)),
    { id: "back" },
  ];
}

export function isShapeEntryOffered(
  flow: BuildFlow,
  id: RootEntryId | BuildMenuEntryId,
): boolean {
  return [...shapeMenu(flow), ...buildMenu(flow)].some(
    (entry) => entry.id === id,
  );
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
  return flow.kind === "heightStep"
    ? [
        ...fillStylesFor(flow.heightedKind).map((id) => ({ id })),
        { id: "cancel" },
      ]
    : [];
}

export function stairContentsMenu(
  flow: BuildFlow,
): MenuEntry<StairContents | "cancel">[] {
  return flow.kind === "stairContents"
    ? [{ id: "stepsOnly" }, { id: "cancel" }]
    : [];
}

export function terrainMenu(flow: BuildFlow): MenuEntry<TerrainEntryId>[] {
  return flow.kind === "terrainConfirm"
    ? [{ id: "confirm" }, { id: "cancel" }]
    : [];
}

export function pasteMenu(): MenuEntry<PasteEntryId>[] {
  return [{ id: "newCopy" }, { id: "endPaste" }, { id: "cancel" }];
}
