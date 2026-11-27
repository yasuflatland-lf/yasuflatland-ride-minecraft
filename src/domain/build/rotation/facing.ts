import { QUARTER_TURN, quarterOf } from "../../shared/facing";
import {
  rightOf as horizontalRightOf,
  length,
  type Vec3,
} from "../../shared/vec";
import type { HorizontalAxis } from "../axis";
import { BUILD_SPEC } from "../spec";
import type { QuarterTurn } from "./quarterTurn";

// Key order sets the clockwise turn indices used by paste rotation.
const FACING_STEP = {
  north: { x: 0, y: 0, z: -1 },
  east: { x: 1, y: 0, z: 0 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
} as const;

export type Facing = keyof typeof FACING_STEP;
export const FACINGS: readonly Facing[] = Object.keys(FACING_STEP) as Facing[];

export function turnBetween(from: Facing, to: Facing): QuarterTurn {
  return ((FACINGS.indexOf(to) - FACINGS.indexOf(from) + 4) % 4) as QuarterTurn;
}

export function effectiveTurn(
  clipboardFacing: Facing,
  gazeFacing: Facing,
  manual: QuarterTurn,
): QuarterTurn {
  return ((turnBetween(clipboardFacing, gazeFacing) + manual) %
    4) as QuarterTurn;
}

export function facingFromDirection(
  direction: Vec3,
  current?: Facing,
): Facing | undefined {
  if (length(direction) < BUILD_SPEC.facingMinHorizontal) return undefined;
  const angle = (Math.atan2(direction.x, -direction.z) * 180) / Math.PI;
  if (current !== undefined) {
    const difference =
      ((angle - FACINGS.indexOf(current) * QUARTER_TURN + 540) % 360) - 180;
    if (Math.abs(difference) <= 45 + BUILD_SPEC.pasteFacingHysteresisDegrees)
      return current;
  }
  return FACINGS[quarterOf(angle)];
}

export function facingFromYaw(yawDegrees: number): Facing {
  return FACINGS[(quarterOf(yawDegrees) + 2) % 4] as Facing;
}

export function parseFacing(value: string): Facing | undefined {
  return FACINGS.find((facing) => facing === value.toLowerCase());
}

export function oppositeFacing(facing: Facing): Facing {
  return FACINGS[(FACINGS.indexOf(facing) + 2) % 4] as Facing;
}

export function facingVector(facing: Facing): Vec3 {
  return { ...FACING_STEP[facing] };
}

export function rightOf(forward: Vec3): Vec3 {
  const right = horizontalRightOf(forward);
  return { x: right.x + 0, y: forward.y, z: right.z };
}

export function facingOfStep(axis: HorizontalAxis, sign: -1 | 1): Facing {
  return FACINGS.find((facing) => FACING_STEP[facing][axis] === sign) as Facing;
}
