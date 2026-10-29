import type { MonitorRule } from "../../monitor/monitor";

export const BLADE_SWITCH_ITEM = "blade_switch";

/** The bulldozer's cab monitor shows the tools of the Building Tools group that are switches (ADR 0139, 0178). */
export const BULLDOZER_MONITOR: MonitorRule = Object.freeze({
  group: "yasu_build:building_tools",
  tools: Object.freeze([
    Object.freeze({
      item: BLADE_SWITCH_ITEM,
      states: Object.freeze(["down", "up"]),
    }),
  ]),
});
