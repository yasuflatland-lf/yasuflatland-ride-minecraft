import { type Cell, cellCenter, sameCell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxOf, type CellBox, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import { type BuildFlow, liveHeightBox } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import type { Staircase } from "../stairs/staircase";
import { endMarkerCell } from "../tapTarget";
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

/**
 * Block centers along the box edges, plus extra points between neighbours
 * on the horizontal edges only, so the outline reads as a line from the side
 * without spending extra particles on the vertical edges.
 */
export function boxOutline(box: CellBox): Vec3[] {
  const budget = BUILD_SPEC.outlineMaxPoints;
  const points = withHorizontalMidpoints(box, edgePoints(box, budget));
  if (points.length <= budget) return points;
  // Thin the cells so the midpoints they bring still fit the budget.
  const cells = edgePoints(box, budget);
  const share = budget / points.length;
  return withHorizontalMidpoints(
    box,
    edgePoints(box, Math.floor(cells.length * share)),
  ).slice(0, budget);
}

function withHorizontalMidpoints(box: CellBox, cells: Cell[]): Vec3[] {
  const { min, max } = box;
  const onEnds = (value: number, lo: number, hi: number) =>
    value === lo || value === hi;
  const steps = BUILD_SPEC.outlineHorizontalSteps;
  const points: Vec3[] = [];
  for (const p of cells) {
    points.push(cellCenter(p, 0.5));
    const alongX =
      onEnds(p.y, min.y, max.y) && onEnds(p.z, min.z, max.z) && p.x < max.x;
    const alongZ =
      onEnds(p.x, min.x, max.x) && onEnds(p.y, min.y, max.y) && p.z < max.z;
    for (let k = 1; k < steps; k++) {
      const offset = 0.5 + k / steps;
      if (alongX) points.push({ x: p.x + offset, y: p.y + 0.5, z: p.z + 0.5 });
      if (alongZ) points.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + offset });
    }
  }
  return points;
}

export function endpointMarkers(
  start: Cell,
  end: Cell | undefined,
  blink: boolean,
): Pick<PreviewSet, "startMarker" | "endMarker" | "sharedMarker"> {
  if (end && sameCell(start, end))
    return {
      startMarker: [],
      endMarker: [],
      sharedMarker: cornerMarkerPoints(start),
    };
  return {
    startMarker: end || blink ? cornerMarkerPoints(start) : [],
    endMarker: end ? cornerMarkerPoints(end) : [],
    sharedMarker: [],
  };
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
  const end = endMarkerCell(flow, aim.end);
  switch (flow.kind) {
    case "idle":
      break;
    case "point1":
      Object.assign(set, endpointMarkers(flow.cell, end, aim.blink));
      if (end) set.shape = boxOutline(boxOf(flow.cell, end));
      break;
    case "baseHeight":
      set.shape = boxOutline(liveHeightBox(flow));
      Object.assign(set, endpointMarkers(flow.from, end, false));
      break;
    case "selected":
    case "terrainConfirm":
      set.shape = boxOutline(flow.selection.box);
      Object.assign(set, endpointMarkers(flow.from, end, false));
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
