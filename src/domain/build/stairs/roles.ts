import type { Cell } from "../../shared/cells";
import { facingVector } from "../rotation/facing";
import { BUILD_SPEC } from "../spec";
import { rowCells } from "./row";
import { type Staircase, stairTreads } from "./staircase";

export type StairRole = "step" | "below" | "headroom" | "above";

export interface StairCell {
  readonly cell: Cell;
  readonly role: StairRole;
  readonly nose: boolean;
}

function* treadRanges(s: Staircase, roles: ReadonlySet<StairRole>) {
  const goalY = s.row.y + s.rise;
  const lowY = Math.min(s.row.y, goalY);
  const highY = Math.max(s.row.y, goalY);
  for (const { start, end, level } of stairTreads(s)) {
    const headroomTop = level + BUILD_SPEC.stairHeadroom;
    // ADR 0254 Decision 5 overlaps headroom and above. Give headroom priority
    // when both are requested so the same cell is only planned once.
    const ranges: readonly [StairRole, number, number][] = [
      ["step", level, level],
      ["below", lowY + 1, level - 1],
      ["headroom", level + 1, headroomTop],
      [
        "above",
        (roles.has("headroom") ? headroomTop : level) + 1,
        highY + BUILD_SPEC.stairHeadroom,
      ],
    ];
    for (const [role, bottom, top] of ranges) {
      if (!roles.has(role)) continue;
      const min = Math.max(bottom, BUILD_SPEC.worldBottomY);
      const max = Math.min(top, BUILD_SPEC.worldTopY);
      if (min <= max) yield { start, end, role, min, max };
    }
  }
}

export function* stairCells(
  s: Staircase,
  roles: ReadonlySet<StairRole>,
): Iterable<StairCell> {
  const direction = facingVector(s.toward);
  for (const { start, end, role, min, max } of treadRanges(s, roles)) {
    for (let k = start; k <= end; k++) {
      const nose = role === "step" && k === (s.rise > 0 ? start : end);
      for (const rowCell of rowCells(s.row)) {
        const x = rowCell.x + direction.x * k;
        const z = rowCell.z + direction.z * k;
        for (let y = min; y <= max; y++)
          yield { cell: { x, y, z }, role, nose };
      }
    }
  }
}

export function stairCellCount(
  s: Staircase,
  roles: ReadonlySet<StairRole>,
): number {
  let columnCount = 0;
  for (const { start, end, min, max } of treadRanges(s, roles))
    columnCount += (end - start + 1) * (max - min + 1);
  return columnCount * (s.row.max[s.row.along] - s.row.min[s.row.along] + 1);
}
