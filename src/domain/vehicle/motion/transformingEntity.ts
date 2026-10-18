// Entity properties, events, and commands every transforming kind shares (ADR 0021, 0026, 0033).
import type { EngineCommand } from "../drive";
import { FORMS, type Form } from "./forms";

export function transformingProperties(maxBank: number) {
  return {
    form: { type: "enum", values: FORMS },
    bank: { type: "float", range: [-maxBank, maxBank] },
    gear_down: { type: "bool" },
  } as const;
}

export const TRANSFORMING_EVENTS = ["gravity_on", "gravity_off"] as const;

type TransformingProperty = keyof ReturnType<typeof transformingProperties>;

function property(
  name: TransformingProperty,
  value: number | boolean | Form,
): EngineCommand {
  return { type: "setProperty", name, value };
}

export function formCommands(form: Form): EngineCommand[] {
  const name: (typeof TRANSFORMING_EVENTS)[number] =
    form === "car" ? "gravity_on" : "gravity_off";
  // Gravity goes first so a failed event leaves the restored form unchanged (ADR 0021).
  return [{ type: "triggerEvent", name }, property("form", form)];
}

export function bankCommand(degrees: number): EngineCommand {
  return property("bank", degrees);
}

export function gearCommand(down: boolean): EngineCommand {
  return property("gear_down", down);
}
