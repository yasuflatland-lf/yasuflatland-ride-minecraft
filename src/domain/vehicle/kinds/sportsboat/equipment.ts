import type { MonitorRule } from "../../monitor/monitor";

export const ICEBREAKER_SWITCH_ITEM = "icebreaker_switch";

/** The items the Sports Boat Equipment Box holds, in creative group order (ADR 0171). */
export const SPORTSBOAT_EQUIPMENT_IDS: readonly string[] = Object.freeze([
  ICEBREAKER_SWITCH_ITEM,
]);

export const SPORTSBOAT_MONITOR: MonitorRule = Object.freeze({
  group: "sportsboat_equipment",
  tools: Object.freeze([
    Object.freeze({
      item: ICEBREAKER_SWITCH_ITEM,
      states: Object.freeze(["off", "on"]),
    }),
  ]),
});
