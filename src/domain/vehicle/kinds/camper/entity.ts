import type { EngineCommand } from "../../drive";
import type { EntityContract } from "../../entityContract";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { CAMPER_SPEC } from "./spec";

export const CAMPER_ENTITY = {
  properties: {
    ...transformingProperties(CAMPER_SPEC.maxBank),
    docked: { type: "bool" },
    door: { type: "float", range: [0, 1] },
  },
  events: [...TRANSFORMING_EVENTS, "dock", "undock"],
  animations: [],
  restored: ["form", "docked", "door"],
} as const satisfies EntityContract;

type CamperProperty = keyof typeof CAMPER_ENTITY.properties;
type CamperEvent = (typeof CAMPER_ENTITY.events)[number];

function property(
  name: CamperProperty,
  value: number | boolean,
): EngineCommand {
  return { type: "setProperty", name, value };
}

function event(name: CamperEvent): EngineCommand {
  return { type: "triggerEvent", name };
}

// The event goes first, so a failed event leaves the restored docked value as it was (ADR 0063).
export function dockCommands(): EngineCommand[] {
  return [event("dock"), property("docked", true)];
}

export function undockCommands(): EngineCommand[] {
  return [event("undock"), property("docked", false)];
}

/** 0 is shut, 1 is swung fully open. */
export function doorCommand(open: number): EngineCommand {
  return property("door", open);
}
