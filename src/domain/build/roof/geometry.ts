import type { Vec3 } from "../../shared/vec";
import { center } from "../box";
import type {
  HeightedPlacement,
  HeightedVolume,
  HeightStepSpec,
} from "../volume/geometry";
import {
  isRoofKind,
  maxRoofHeight,
  type RoofSpec,
  roofCells,
  roofCount,
} from "./roof";

function roofSpec(spec: HeightStepSpec): RoofSpec {
  if (!isRoofKind(spec.kind)) throw new Error(`Not a roof kind: ${spec.kind}`);
  return { ...spec, kind: spec.kind };
}

export const roofPlacement: HeightedPlacement = {
  cells(spec, fill) {
    const roof = roofSpec(spec);
    if (fill === "tube") throw new Error("Roofs do not support tube fill");
    return roofCells(roof, fill === "hollow");
  },
  count(spec, fill) {
    const roof = roofSpec(spec);
    if (fill === "tube") throw new Error("Roofs do not support tube fill");
    return roofCount(roof, fill === "hollow");
  },
};

export const roofVolume: HeightedVolume = {
  maxHeight: maxRoofHeight,
  wireframe(spec, maxPoints) {
    return roofWireframe(roofSpec(spec), maxPoints);
  },
};

function roofWireframe(spec: RoofSpec, maxPoints: number): Vec3[] {
  const { min, max } = spec.base;
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
    spec.kind === "hip"
      ? max.x - min.x === max.z - min.z
        ? shortSpan / 2
        : Math.floor(shortSpan / 2)
      : 0;
  const y = min.y + spec.height - 1 + 0.5;
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
  const perSegment = Math.floor(maxPoints / segments.length);
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
