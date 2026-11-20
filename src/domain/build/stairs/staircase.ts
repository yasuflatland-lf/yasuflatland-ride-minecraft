import type { Cell } from "../../shared/cells";
import { sub3 } from "../../shared/vec";
import { dominantHorizontalAxis } from "../axis";
import type { Taps } from "../flow/flow";
import { type Facing, facingVector } from "../rotation/facing";
import type { StairRow } from "./row";

export interface Staircase {
  readonly row: StairRow;
  readonly toward: Facing;
  readonly run: number;
  readonly rise: number;
}

export function staircaseToward(
  row: StairRow,
  hit: Cell,
): Staircase | undefined {
  const axis =
    row.along === undefined
      ? dominantHorizontalAxis(sub3(hit, row.min))
      : row.along === "x"
        ? "z"
        : "x";
  const offset = hit[axis] - row.min[axis];
  const run = Math.abs(offset);
  const rise = Math.max(-run, Math.min(run, hit.y - row.y));
  if (run === 0 || rise === 0) return undefined;
  const toward =
    axis === "x"
      ? offset > 0
        ? "east"
        : "west"
      : offset > 0
        ? "south"
        : "north";
  return { row, toward, run, rise };
}

function treadDepths(s: Staircase) {
  const count = Math.abs(s.rise);
  return { count, depth: Math.floor(s.run / count), deeper: s.run % count };
}

export function levelAt(s: Staircase, k: number): number {
  if (k === 0) return s.row.y;
  const { depth, deeper } = treadDepths(s);
  // ADR 0254 puts the extra depth on the treads nearest the foot row.
  const deeperRun = deeper * (depth + 1);
  const tread =
    k <= deeperRun
      ? Math.ceil(k / (depth + 1))
      : deeper + Math.ceil((k - deeperRun) / depth);
  return s.row.y + Math.sign(s.rise) * tread;
}

export function* stairTreads(s: Staircase) {
  yield { start: 0, end: 0, level: levelAt(s, 0) };
  const { count, depth, deeper } = treadDepths(s);
  let start = 1;
  for (let i = 0; i < count; i++) {
    const end = start + depth + Number(i < deeper) - 1;
    yield { start, end, level: levelAt(s, start) };
    start = end + 1;
  }
}

export function goalRowTaps(s: Staircase): Taps {
  const direction = facingVector(s.toward);
  const advance = (cell: Cell): Cell => ({
    x: cell.x + s.run * direction.x,
    y: s.row.y + s.rise,
    z: cell.z + s.run * direction.z,
  });
  return { from: advance(s.row.min), to: advance(s.row.max) };
}
