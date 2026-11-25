import type { EquipmentRule } from "../../equipment/equipment";

export const BLADE_SWITCH_ITEM = "blade_switch";
export const ROAD_PAVER_SWITCH_ITEM = "road_paver_switch";
export const WIDE_BLADE_SWITCH_ITEM = "wide_blade_switch";

/** The bulldozer's switches belong to the Building Tools group (ADR 0139, 0178). */
export const BULLDOZER_EQUIPMENT: EquipmentRule = Object.freeze({
  switches: Object.freeze([
    Object.freeze({
      item: BLADE_SWITCH_ITEM,
      states: Object.freeze<[string, ...string[]]>(["down", "up"]),
      feedback: "blade",
    }),
    Object.freeze({
      item: WIDE_BLADE_SWITCH_ITEM,
      states: Object.freeze<[string, ...string[]]>(["normal", "wide"]),
      feedback: "wide_blade",
    }),
    Object.freeze({
      item: ROAD_PAVER_SWITCH_ITEM,
      states: Object.freeze<[string, ...string[]]>(["off", "on"]),
      feedback: "road_paver",
    }),
  ]),
});
