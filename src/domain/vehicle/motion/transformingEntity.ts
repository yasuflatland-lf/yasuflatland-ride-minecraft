// Entity properties, events, and commands every transforming kind shares
// (ADR 0021, 0026, 0033). ADR 0039 sets their names and 0055 keeps them local
// to the entity.
import type { EngineCommand } from "../drive";
import { commandsFor } from "../entityContract";
import { FORMS, type Form } from "./forms";

export function transformingProperties(maxBank: number) {
  return {
    form: { type: "enum", values: FORMS },
    // 0 - maxBank, not -maxBank: maxBank 0 must give +0, which is what a pack's JSON holds.
    bank: { type: "float", range: [0 - maxBank, maxBank] },
    gear_down: { type: "bool" },
  } as const;
}

export const TRANSFORMING_EVENTS = ["gravity_on", "gravity_off"] as const;

type TransformingFragment = {
  properties: ReturnType<typeof transformingProperties>;
  events: typeof TRANSFORMING_EVENTS;
};

const { property, event } = commandsFor<TransformingFragment>();

export function formCommands(form: Form): EngineCommand[] {
  // Gravity goes first so a failed event leaves the restored form unchanged (ADR 0021).
  return [
    event(form === "car" ? "gravity_on" : "gravity_off"),
    property("form", form),
  ];
}

export function bankCommand(degrees: number): EngineCommand {
  return property("bank", degrees);
}

export function gearCommand(down: boolean): EngineCommand {
  return property("gear_down", down);
}
