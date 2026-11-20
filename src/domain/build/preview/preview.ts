import { type Cell, cellCenter } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxOf, type CellBox, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import { type BuildFlow, liveHeightBox } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import type { Staircase } from "../stairs/staircase";
import { volumeOf } from "../volume/geometry";
import { pasteOutline } from "./pasteOutline";
import { stairPreviewPoints } from "./stairPreview";

export interface PreviewSet {
  startMarker: Vec3[];
  endMarker: Vec3[];
  sharedMarker: Vec3[];
  shape: Vec3[];
  roof: Vec3[];
  stairs: Vec3[];
  paste: Vec3[];
  pasteVertical: Vec3[];
}

export interface PreviewAim {
  blink: boolean;
  end?: Cell;
  height?: number;
  staircase?: Staircase;
  pasteBox?: CellBox;
}

function outline(box: CellBox): Vec3[] {
  return edgePoints(box, BUILD_SPEC.outlineMaxPoints).map((p) =>
    cellCenter(p, 0.5),
  );
}

export function previewPoints(flow: BuildFlow, aim: PreviewAim): PreviewSet {
  const set: PreviewSet = {
    startMarker: [],
    endMarker: [],
    sharedMarker: [],
    shape: [],
    roof: [],
    stairs: [],
    paste: [],
    pasteVertical: [],
  };
  switch (flow.kind) {
    case "idle":
      break;
    case "point1":
      if (aim.blink) set.startMarker = cornerMarkerPoints(flow.cell);
      if (aim.end) {
        set.shape = outline(boxOf(flow.cell, aim.end));
        set.endMarker = cornerMarkerPoints(aim.end);
      }
      break;
    case "baseHeight":
      set.shape = outline(liveHeightBox(flow));
      set.endMarker = cornerMarkerPoints(flow.to);
      break;
    case "selected":
    case "terrainConfirm":
      set.shape = outline(flow.selection.box);
      set.endMarker = cornerMarkerPoints(flow.to);
      break;
    case "heightStep": {
      const height = flow.heightLocked
        ? flow.previous
        : (aim.height ?? flow.previous);
      const wireframe = volumeOf(flow.heightedKind).wireframe(
        {
          base: flow.base,
          kind: flow.heightedKind,
          height,
          roofStyle: flow.roofStyle,
        },
        BUILD_SPEC.outlineMaxPoints,
      );
      set.roof = wireframe;
      break;
    }
    case "stairAim":
      if (aim.staircase)
        set.stairs = stairPreviewPoints(
          aim.staircase,
          BUILD_SPEC.outlineMaxPoints,
        );
      break;
    case "stairContents":
      set.stairs = stairPreviewPoints(
        flow.staircase,
        BUILD_SPEC.outlineMaxPoints,
      );
      break;
    case "pasteAim":
      if (aim.pasteBox) {
        const { horizontal, vertical } = pasteOutline(
          aim.pasteBox,
          BUILD_SPEC.outlineMaxPoints,
        );
        set.paste = horizontal;
        set.pasteVertical = vertical;
      }
      break;
  }
  return set;
}
