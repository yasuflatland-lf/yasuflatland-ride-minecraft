export const SUV_PACK_CONTRACT = {
  roofTentShellHalfWidth: 1.968,
  roofTentHardtopHalfWidth: (0.7 * (26.1 / 2.064) * 1.45) / 16,
} as const;

export const CAMPER_PACK_CONTRACT = {
  bumperBoxY: 0.5,
  hiddenHitboxSize: 0.1,
} as const;

export const TENT_PACK_CONTRACT = {
  ceilingLight: 4,
  lanternLight: 15,
  tarpHalfWidth: 3.5,
  tarpTop: 3,
} as const;

export const ROOF_TENT_PACK_CONTRACT = {
  // The 0.35-block offset follows Java's ridingOffset convention. Bedrock's offset is unmeasured.
  seatRiderOffset: 0.35,
  standingEyeHeight: 1.62,
  eyeBelowRidge: 0.2,
  groundShellRidge: 19 / 16,
} as const;

export const BULLDOZER_PACK_CONTRACT = {
  monitorGroup: "yasu_build:building_tools",
} as const;

export const SPORTSBOAT_PACK_CONTRACT = {
  monitorGroup: "yasu_ride:sportsboat_equipment",
} as const;
