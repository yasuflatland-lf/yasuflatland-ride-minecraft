import type { EngineCommand } from "../../drive";
import { commandsFor, type EntityContract } from "../../entityContract";
import { DOCK_EVENTS, DOCK_PROPERTIES } from "../../motion/dockEntity";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { CAMPER_SPEC } from "./spec";

export const CAMPER_ENTITY = {
  properties: {
    ...transformingProperties(CAMPER_SPEC.maxBank),
    ...DOCK_PROPERTIES,
    door: { type: "float", range: [0, 1] },
    shower_door: { type: "float", range: [0, 1] },
    shower: { type: "bool" },
  },
  events: [...TRANSFORMING_EVENTS, ...DOCK_EVENTS],
  animations: [],
  restored: ["form", "docked", "door", "shower_door"],
} as const satisfies EntityContract;

const { property } = commandsFor<typeof CAMPER_ENTITY>();

/** 0 is shut, 1 is swung fully open. */
export function doorCommand(open: number): EngineCommand {
  return property("door", open);
}

/** 0 is shut, 1 is swung fully open into the aisle (ADR 0094). */
export function showerDoorCommand(open: number): EngineCommand {
  return property("shower_door", open);
}

/** Whether the shower sprays this tick (ADR 0094). */
export function showerCommand(on: boolean): EngineCommand {
  return property("shower", on);
}
