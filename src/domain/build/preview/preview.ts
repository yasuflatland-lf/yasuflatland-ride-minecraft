import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { type Box, boxOf, edgePoints } from "../box";
import { cornerMarkerPoints } from "../cornerMarker";
import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";

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
  roofHeight?: number;
  pasteBox?: Box;
}

function outline(box: Box): Vec3[] {
  return edgePoints(box, BUILD_SPEC.outlineMaxPoints).map(center);
}

function center(p: Vec3): Vec3 {
  return { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
}

function roofWireframe(
  flow: Extract<BuildFlow, { kind: "roofHeight" }>,
  height: number,
): Vec3[] {
  const { min, max } = flow.base;
  const corners = [
    center(min),
    center({ ...min, x: max.x }),
    center({ ...max, y: min.y }),
    center({ ...min, z: max.z }),
  ];
  const alongX = max.x - min.x >= max.z - min.z;
  const shortSpan = Math.min(max.x - min.x, max.z - min.z);
  // Even squares use the center of the top 2x2 layer as their single visual apex.
  const inset =
    flow.roofKind === "hip"
      ? max.x - min.x === max.z - min.z
        ? shortSpan / 2
        : Math.floor(shortSpan / 2)
      : 0;
  const y = min.y + height - 1 + 0.5;
  const middleX = (min.x + max.x) / 2 + 0.5;
  const middleZ = (min.z + max.z) / 2 + 0.5;
  const a = alongX
    ? { x: min.x + 0.5 + inset, y, z: middleZ }
    : { x: middleX, y, z: min.z + 0.5 + inset };
  const b = alongX
    ? { x: max.x + 0.5 - inset, y, z: middleZ }
    : { x: middleX, y, z: max.z + 0.5 - inset };
  const segments: [Vec3, Vec3][] = [[a, b]];
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i] as Vec3;
    segments.push([corner, corners[(i + 1) % corners.length] as Vec3]);
    segments.push([
      corner,
      (alongX ? corner.x === min.x + 0.5 : corner.z === min.z + 0.5) ? a : b,
    ]);
  }
  const perSegment = Math.floor(BUILD_SPEC.outlineMaxPoints / segments.length);
  return segments.flatMap(([from, to]) => {
    const count = Math.min(
      perSegment,
      Math.max(
        2,
        Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)) + 1,
      ),
    );
    return Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      return {
        x: from.x + t * (to.x - from.x),
        y: from.y + t * (to.y - from.y),
        z: from.z + t * (to.z - from.z),
      };
    });
  });
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
    case "roofHeight":
      set.roof = roofWireframe(flow, aim.roofHeight ?? flow.previous);
      break;
    case "pasteAim":
      if (aim.pasteBox) set.paste = outline(aim.pasteBox);
      break;
  }
  return set;
}
