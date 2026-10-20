// The docked property and the dock and undock events that every kind that docks
// shares (ADR 0063, 0068).
import type { EngineCommand } from "../drive";
import { commandsFor } from "../entityContract";

export const DOCK_PROPERTIES = { docked: { type: "bool" } } as const;
export const DOCK_EVENTS = ["dock", "undock"] as const;

const { property, event } = commandsFor<{
  properties: typeof DOCK_PROPERTIES;
  events: typeof DOCK_EVENTS;
}>();

// The event goes first, so a failed event leaves the restored docked value as it was (ADR 0063).
export function dockCommands(): EngineCommand[] {
  return [event("dock"), property("docked", true)];
}

export function undockCommands(): EngineCommand[] {
  return [event("undock"), property("docked", false)];
}
