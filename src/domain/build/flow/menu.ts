import type { BuildSession } from "../session";
import { type Shape, shapeOf, stylesFor } from "../shape/shape";
import {
  type FillStyle,
  fillStylesFor,
  type HeightedKind,
  isBoxStepKind,
} from "../volume/kind";
import type { BuildFlow } from "./flow";

export type EditEntryId =
  | "cut"
  | "removeAbove"
  | "rotate"
  | "fillBelow"
  | "copy";
export type BuildEntryId =
  | "place"
  | "fill"
  | "frame"
  | "faces"
  | "walls"
  | Exclude<HeightedKind, "sideCylinderX" | "sideCylinderZ">
  | "sideCylinder";
export type RootEntryId = EditEntryId | "buildShape" | "place" | "cancel";
export type BuildMenuEntryId = BuildEntryId | "back";
export type ShapeEntryId = EditEntryId | BuildEntryId | "cancel";
export type ContentsEntryId = FillStyle | "cancel";
export type TerrainEntryId = "confirm" | "cancel";
export type UtilityEntryId = "copy" | "undo" | "clear";

export type PasteEntryId = "newCopy" | "endPaste" | "cancel";

export interface MenuEntry<Id extends string = string> {
  id: Id;
  on?: boolean;
}

const RECT_SOLID_ENTRIES: readonly BuildEntryId[] = [
  "gable",
  "hip",
  "cylinder",
  "sideCylinder",
  "sphere",
  "cube",
];
const BOX_SOLID_ENTRIES: readonly BuildEntryId[] = [
  "cylinder",
  "sideCylinder",
  "sphere",
];

export function editEntries(): MenuEntry<EditEntryId>[] {
  return [
    { id: "cut" },
    { id: "removeAbove" },
    { id: "rotate" },
    { id: "fillBelow" },
    { id: "copy" },
  ];
}

export function buildEntries(shape: Shape): MenuEntry<BuildEntryId>[] {
  const extraEntries: readonly BuildEntryId[] =
    shape.kind === "rect" && shape.flat === "y"
      ? RECT_SOLID_ENTRIES
      : shape.kind === "box"
        ? BOX_SOLID_ENTRIES
        : [];
  return [
    ...stylesFor(shape).map<MenuEntry<BuildEntryId>>((style) => ({
      id: shape.kind === "line" ? "place" : style,
    })),
    ...extraEntries.map((id) => ({ id })),
  ];
}

export function isEditEntry(id: ShapeEntryId): id is EditEntryId {
  return editEntries().some((entry) => entry.id === id);
}

export function isBuildEntry(id: ShapeEntryId): id is BuildEntryId {
  return id !== "cancel" && !isEditEntry(id);
}

export function shapeMenu(flow: BuildFlow): MenuEntry<RootEntryId>[] {
  if (flow.kind !== "selected" || flow.menuLevel !== "root") return [];
  return [
    { id: "cut" },
    { id: "removeAbove" },
    {
      id:
        shapeOf(flow.selection.box.min, flow.selection.box.max).kind === "line"
          ? "place"
          : "buildShape",
    },
    { id: "rotate" },
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
  if (session.flow.kind === "rotateMode") return [];
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

export function pasteMenu(): MenuEntry<PasteEntryId>[] {
  return [{ id: "newCopy" }, { id: "endPaste" }, { id: "cancel" }];
}
