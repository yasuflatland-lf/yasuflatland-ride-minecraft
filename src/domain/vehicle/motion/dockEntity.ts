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
  return [event("dock"), dockedCommand(true)];
}

export function undockCommands(): EngineCommand[] {
  return [event("undock"), dockedCommand(false)];
}

/** The docked property alone, which a kind resends after a failed send (ADR 0156). */
export function dockedCommand(docked: boolean): EngineCommand {
  return property("docked", docked);
}

export class DockedResend {
  private heldOnce = false;
  private pending = false;

  resync(): void {
    // Before the first hold, the entity still has its default docked value (ADR 0156).
    this.pending = this.heldOnce;
  }

  next(wasHeld: boolean, held: boolean): EngineCommand | undefined {
    this.heldOnce ||= held;
    if (!this.pending) return undefined;
    this.pending = false;
    return held === wasHeld ? dockedCommand(held) : undefined;
  }
}
