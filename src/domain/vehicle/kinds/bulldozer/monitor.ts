import type { MonitorRule } from "../../monitor/monitor";

export const BLADE_SWITCH_ITEM = "blade_switch";

/** The bulldozer's cab monitor shows the Bulldozer Switches group's tools (ADR 0139). */
export const BULLDOZER_MONITOR: MonitorRule = Object.freeze({
  group: "bulldozer_switches",
  tools: Object.freeze([
    Object.freeze({
      item: BLADE_SWITCH_ITEM,
      states: Object.freeze(["down", "up"]),
    }),
  ]),
});
