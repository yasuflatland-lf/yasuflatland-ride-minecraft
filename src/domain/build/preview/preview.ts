import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { type Box, boxOf, center, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import { geometryOf } from "../volume/geometry";

export interface PreviewSet {
  marker: Vec3[];
  shape: Vec3[];
  endCube: Vec3[];
  roof: Vec3[];
  paste: Vec3[];
}

export interface PreviewAim {
  blink: boolean;
  end?: Cell;
  height?: number;
  pasteBox?: Box;
}

function outline(box: Box): Vec3[] {
  return edgePoints(box, BUILD_SPEC.outlineMaxPoints).map(center);
}

export function previewPoints(flow: BuildFlow, aim: PreviewAim): PreviewSet {
  const set: PreviewSet = {
    marker: [],
    shape: [],
    endCube: [],
    roof: [],
    paste: [],
  };
  switch (flow.kind) {
    case "idle":
      break;
    case "point1":
      if (aim.blink) set.marker = cornerMarkerPoints(flow.cell);
      if (aim.end) {
        set.shape = outline(boxOf(flow.cell, aim.end));
        set.endCube = cornerMarkerPoints(aim.end);
      }
      break;
    case "endpoint":
      set.shape = outline(boxOf(flow.from, flow.to));
      set.endCube = cornerMarkerPoints(flow.to);
      break;
    case "heightStep":
      set.roof = geometryOf(flow.heightedKind).wireframe(
        {
          base: flow.base,
          kind: flow.heightedKind,
          height: aim.height ?? flow.previous,
        },
        BUILD_SPEC.outlineMaxPoints,
      );
      break;
    case "pasteAim":
      if (aim.pasteBox) set.paste = outline(aim.pasteBox);
      break;
  }
  return set;
}
