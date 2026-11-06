import type { Cell } from "../../shared/cells";
import type { HorizontalAxis } from "../axis";
import { ellipseOn, line, outlinePoints } from "../wireframe";
import { ellipseCells } from "./ellipse";
import type {
  HeightedPlacement,
  HeightedVolume,
  HeightStepSpec,
} from "./geometry";

export function sideCylinderPlacement(axis: HorizontalAxis): HeightedPlacement {
  const across = axis === "x" ? "z" : "x";
  const section = ({ base, height }: HeightStepSpec) =>
    ellipseCells({
      uMin: base.min[across],
      uMax: base.max[across],
      vMin: base.min.y,
      vMax: base.min.y + height - 1,
    });
  return {
    *cells(spec, fill): Generator<Cell> {
      const { min, max } = spec.base;
      for (const { u, v, wall } of section(spec)) {
        if (fill === "tube" && !wall) continue;
        for (let along = min[axis]; along <= max[axis]; along++) {
          if (
            fill === "hollow" &&
            !wall &&
            along > min[axis] &&
            along < max[axis]
          )
            continue;
          yield axis === "x"
            ? { x: along, y: v, z: u }
            : { x: u, y: v, z: along };
        }
      }
    },
    count(spec, fill) {
      let inside = 0;
      let walls = 0;
      for (const { wall } of section(spec)) {
        inside++;
        if (wall) walls++;
      }
      const length = spec.base.max[axis] - spec.base.min[axis] + 1;
      if (fill === "fill") return inside * length;
      if (fill === "tube") return walls * length;
      const caps = Math.min(2, length);
      return inside * caps + walls * (length - caps);
    },
  };
}

export function sideCylinderVolume(axis: HorizontalAxis): HeightedVolume {
  const across = axis === "x" ? "z" : "x";
  return {
    maxHeight(base, worldTopY) {
      return Math.max(1, worldTopY - base.min.y + 1);
    },
    wireframe({ base: { min, max }, height }, maxPoints) {
      const center = {
        x: (min.x + max.x + 1) / 2,
        y: min.y + height / 2,
        z: (min.z + max.z + 1) / 2,
      };
      const radius = (max[across] - min[across] + 1) / 2;
      const a = { x: 0, y: 0, z: 0, [across]: radius };
      const b = { x: 0, y: height / 2, z: 0 };
      const start = min[axis] + 0.5;
      const end = max[axis] + 0.5;
      const ends = start === end ? [start] : [start, end];
      const rings = ends.map((along) =>
        ellipseOn({ ...center, [axis]: along }, a, b),
      );
      const horizontal = [min.y, min.y + height].map((y) =>
        line({ ...center, [axis]: start, y }, { ...center, [axis]: end, y }),
      );
      return outlinePoints(horizontal, rings, maxPoints);
    },
  };
}
