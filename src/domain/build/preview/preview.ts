import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxOf, type CellBox, center, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import { volumeOf } from "../volume/geometry";
import { volumeSize } from "../volume/size";

export interface PreviewSet {
  marker: Vec3[];
  shape: Vec3[];
  endCube: Vec3[];
  roof: Vec3[];
  paste: Vec3[];
  copy: Vec3[];
  copyOver: Vec3[];
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
    copy: [],
    copyOver: [],
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
      if (flow.heightedKind === "copy") {
        const size = volumeSize(flow.base, height);
        if (size.x * size.y * size.z > BUILD_SPEC.maxCopyVolume)
          set.copyOver = wireframe;
        else set.copy = wireframe;
      } else set.roof = wireframe;
      break;
    }
    case "pasteAim":
      if (aim.pasteBox) set.paste = outline(aim.pasteBox);
      break;
  }
  return set;
}
