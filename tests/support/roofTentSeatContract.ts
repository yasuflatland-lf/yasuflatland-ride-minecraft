import { ROOF_TENT_SPEC } from "../../src/domain/camp/spec";
import type { RoofTentShell } from "../../src/domain/shared/roofTent";
import { ROOF_TENT_PACK_CONTRACT } from "./packContract";

const SHELL_RIDGE: Record<RoofTentShell, number> = {
  raised: ROOF_TENT_SPEC.shellRidge,
  flat: ROOF_TENT_PACK_CONTRACT.groundShellRidge,
};

/**
 * Eye height above the tent origin: the same clearance below the variant's own ridge.
 * This is the single definition of the seated eye height; `rideSeatY` derives the pack seat offset from it.
 */
export function seatedEyeHeight(variant: RoofTentShell): number {
  return SHELL_RIDGE[variant] - ROOF_TENT_PACK_CONTRACT.eyeBelowRidge;
}

export function rideSeatY(variant: RoofTentShell = "raised"): number {
  return Number(
    (
      seatedEyeHeight(variant) -
      ROOF_TENT_PACK_CONTRACT.standingEyeHeight +
      ROOF_TENT_PACK_CONTRACT.seatRiderOffset
    ).toFixed(4),
  );
}
