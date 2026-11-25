import {
  defineEquipmentSwitch,
  type EquipmentRule,
} from "../../equipment/equipment";

export const BLADE_SWITCH = defineEquipmentSwitch(
  "blade_switch",
  ["down", "up"],
  "blade",
);
export const WIDE_BLADE_SWITCH = defineEquipmentSwitch(
  "wide_blade_switch",
  ["normal", "wide"],
  "wide_blade",
);
export const ROAD_PAVER_SWITCH = defineEquipmentSwitch(
  "road_paver_switch",
  ["off", "on"],
  "road_paver",
);

/** The bulldozer's switches belong to the Building Tools group (ADR 0139, 0178). */
export const BULLDOZER_EQUIPMENT: EquipmentRule = Object.freeze({
  switches: Object.freeze([BLADE_SWITCH, WIDE_BLADE_SWITCH, ROAD_PAVER_SWITCH]),
});
