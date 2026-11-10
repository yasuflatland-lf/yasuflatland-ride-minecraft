import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxOf, type CellBox, center, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import { volumeOf } from "../volume/geometry";
import { boxStepLimit, boxStepVolume, isBoxStepKind } from "../volume/kind";

export interface PreviewSet {
  marker: Vec3[];
  shape: Vec3[];
  endCube: Vec3[];
  roof: Vec3[];
  paste: Vec3[];
  boxStep: Vec3[];
  boxStepOver: Vec3[];
}

export interface PreviewAim {
  blink: boolean;
  end?: Cell;
  height?: number;
  pasteBox?: CellBox;
}

function outline(box: CellBox): Vec3[] {
  return edgePoints(box, BUILD_SPEC.outlineMaxPoints).map(center);
}

export function previewPoints(flow: BuildFlow, aim: PreviewAim): PreviewSet {
  const set: PreviewSet = {
    marker: [],
    shape: [],
    endCube: [],
    roof: [],
    paste: [],
    boxStep: [],
    boxStepOver: [],
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
    case "terrainConfirm":
      set.shape = outline(boxOf(flow.from, flow.to));
      set.endCube = cornerMarkerPoints(flow.to);
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
        },
        BUILD_SPEC.outlineMaxPoints,
      );
      if (isBoxStepKind(flow.heightedKind)) {
        const box = {
          min: flow.base.min,
          max: { ...flow.base.max, y: flow.base.min.y + height - 1 },
        };
        if (
          boxStepVolume(flow.heightedKind, box) >
          boxStepLimit(flow.heightedKind)
        )
          set.boxStepOver = wireframe;
        else set.boxStep = wireframe;
      } else set.roof = wireframe;
      break;
    }
    case "pasteAim":
      if (aim.pasteBox) set.paste = outline(aim.pasteBox);
      break;
  }
  return set;
}
