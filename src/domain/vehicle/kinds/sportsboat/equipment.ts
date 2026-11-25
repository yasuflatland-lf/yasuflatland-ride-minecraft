import {
  defineEquipmentSwitch,
  type EquipmentRule,
} from "../../equipment/equipment";

export const ICEBREAKER_SWITCH = defineEquipmentSwitch(
  "icebreaker_switch",
  ["off", "on"],
  "icebreaker",
);

/** The items the Sports Boat Equipment Box holds, in creative group order (ADR 0171). */
export const SPORTSBOAT_EQUIPMENT_IDS: readonly string[] = Object.freeze([
  ICEBREAKER_SWITCH.item,
]);

export const SPORTSBOAT_EQUIPMENT: EquipmentRule = Object.freeze({
  switches: Object.freeze([ICEBREAKER_SWITCH]),
});
