import { QUARTER_TURN, quarterOf } from "../../shared/facing";
import type { Vec3 } from "../../shared/vec";
import { length } from "../../shared/vec";
import { BUILD_SPEC } from "../spec";
import type { QuarterTurn } from "./quarterTurn";

export type Facing = "north" | "east" | "south" | "west";
export const FACINGS: readonly Facing[] = ["north", "east", "south", "west"];

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
  const opposite: Record<Facing, Facing> = {
    north: "south",
    east: "west",
    south: "north",
    west: "east",
  };
  return opposite[facing];
}

export function facingVector(facing: Facing): Vec3 {
  switch (facing) {
    case "north":
      return { x: 0, y: 0, z: -1 };
    case "east":
      return { x: 1, y: 0, z: 0 };
    case "south":
      return { x: 0, y: 0, z: 1 };
    case "west":
      return { x: -1, y: 0, z: 0 };
  }
}
