import { CLEARABLE_DECORATIONS } from "./decorations";

export interface StandSample {
  readonly typeId: string;
  readonly isAir: boolean;
  readonly isLiquid: boolean;
  readonly solidTop: boolean;
}

export interface StandPolicy {
  readonly allowPassableBody: boolean;
  readonly hazards: ReadonlySet<string>;
  readonly rejectDecorationFloor: boolean;
  readonly requireSolidFloor: boolean;
}

export function isStandable(
  feet: StandSample | undefined,
  head: StandSample | undefined,
  floor: StandSample | undefined,
  policy: StandPolicy,
): boolean {
  if (!feet || !head || !floor) return false;
  return (
    !floor.isAir &&
    !floor.isLiquid &&
    (!policy.requireSolidFloor || floor.solidTop) &&
    (!policy.rejectDecorationFloor ||
      !CLEARABLE_DECORATIONS.has(floor.typeId)) &&
    !policy.hazards.has(floor.typeId) &&
    [feet, head].every(
      (block) =>
        !policy.hazards.has(block.typeId) &&
        (block.isAir ||
          (policy.allowPassableBody && !block.isLiquid && !block.solidTop)),
    )
  );
}
