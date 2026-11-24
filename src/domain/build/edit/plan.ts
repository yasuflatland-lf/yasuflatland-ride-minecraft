// Lazy edit plans, so a 100,000-cell edit is never held in memory at once.
// The edit job rechecks protection when applying each write; terrain scans also
// treat protected cells as barriers.
import type { Cell } from "../../shared/cells";
import { AIR, type BlockState } from "../blockState";
import type { HeightRange } from "../heightRange";
import { oppositeFacing } from "../rotation/facing";
import { cellsOfShape, type Shape, type ShapeStyle } from "../shape/shape";
import { stairDescending, stairFlatTop, stairMaterialOf } from "../stair";
import { type StairRole, stairCells } from "../stairs/roles";
import type { Staircase } from "../stairs/staircase";
import type { TerrainArea } from "../terrain/area";
import { placementOf } from "../volume/geometry";
import type { FillStyle } from "../volume/kind";
import type { HeightedSpec } from "../volume/types";
import { type PlannedChange, type PlanStep, SCAN_STEP } from "./change";
import type { Pattern } from "./pattern";

export function* planShape(
  shape: Shape,
  style: ShapeStyle,
  pattern: Pattern,
): Iterable<PlannedChange> {
  for (const cell of cellsOfShape(shape, style))
    yield { cell, after: pattern.stateAt(cell) };
}

export function* planHeighted(
  spec: HeightedSpec,
  fill: FillStyle,
  pattern: Pattern,
): Iterable<PlannedChange> {
  for (const cell of placementOf(spec.kind).cells(spec, fill))
    yield { cell, after: pattern.stateAt(cell) };
}

export function* planStairs(
  s: Staircase,
  roles: ReadonlySet<StairRole>,
  material: BlockState,
  range: HeightRange,
): Iterable<PlannedChange> {
  const stair = stairMaterialOf(material);
  const lowerEnd = s.rise > 0 ? oppositeFacing(s.toward) : s.toward;
  const noseState = stair ? stairDescending(stair, lowerEnd) : material;
  const flatState = stair ? stairFlatTop(stair) : material;
  for (const { cell, role, nose } of stairCells(s, roles, range)) {
    const after =
      role === "step" || role === "below"
        ? nose
          ? noseState
          : flatState
        : AIR;
    yield { cell, after };
  }
}

/** Scan marks survive writes, so filling cannot disconnect the remaining search. */
export function* planFillBelow(
  area: TerrainArea,
  material: BlockState,
  isFillable: (cell: Cell) => boolean,
  bottomY: number,
): Iterable<PlanStep> {
  const width = area.maxX - area.minX + 1;
  const depth = area.maxZ - area.minZ + 1;
  const layers = area.higherY - bottomY + 1;
  if (layers <= 0) return;
  const plane = width * depth;
  const visited = new Uint8Array(plane * layers);
  const stack: number[] = [];
  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    stack.push(index);
  };
  for (let i = 0; i < plane; i++) enqueue((layers - 1) * plane + i);
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % width;
    const z = Math.floor(index / width) % depth;
    const y = Math.floor(index / plane);
    const cell = { x: area.minX + x, y: bottomY + y, z: area.minZ + z };
    const fillable = isFillable(cell);
    yield SCAN_STEP;
    if (!fillable) continue;
    yield { cell, after: material };
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (z > 0) enqueue(index - width);
    if (z + 1 < depth) enqueue(index + width);
    if (y > 0) enqueue(index - plane);
    if (y + 1 < layers) enqueue(index + plane);
  }
}
