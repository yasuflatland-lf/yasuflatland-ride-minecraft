import type { EquipmentRule } from "../../equipment/equipment";

export const ICEBREAKER_SWITCH_ITEM = "icebreaker_switch";
export const ICEBREAKER_OFF = "off";
export const ICEBREAKER_ON = "on";

/** The items the Sports Boat Equipment Box holds, in creative group order (ADR 0171). */
export const SPORTSBOAT_EQUIPMENT_IDS: readonly string[] = Object.freeze([
  ICEBREAKER_SWITCH_ITEM,
]);

export const SPORTSBOAT_EQUIPMENT: EquipmentRule = Object.freeze({
  switches: Object.freeze([
    Object.freeze({
      item: ICEBREAKER_SWITCH_ITEM,
      states: Object.freeze([ICEBREAKER_OFF, ICEBREAKER_ON] as const),
      feedback: "icebreaker",
    }),
  ]),
});
