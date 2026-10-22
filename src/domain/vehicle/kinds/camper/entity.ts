import type { EngineCommand } from "../../drive";
import { commandsFor, type EntityContract } from "../../entityContract";
import { DOCK_EVENTS, DOCK_PROPERTIES } from "../../motion/dockEntity";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import type { StorageDoorId } from "./furniture";
import { CAMPER_SPEC } from "./spec";

export const CAMPER_ENTITY = {
  properties: {
    ...transformingProperties(CAMPER_SPEC.maxBank),
    ...DOCK_PROPERTIES,
    door: { type: "float", range: [0, 1] },
    shower_door: { type: "float", range: [0, 1] },
    shower: { type: "bool" },
    cabinet_sink_door: { type: "float", range: [0, 1] },
    cabinet_stove_door: { type: "float", range: [0, 1] },
    ceiling_lights: { type: "bool" },
  },
  events: [...TRANSFORMING_EVENTS, ...DOCK_EVENTS],
  animations: [],
  restored: [
    "form",
    "docked",
    "door",
    "shower_door",
    "cabinet_sink_door",
    "cabinet_stove_door",
    "ceiling_lights",
  ],
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

/**
 * The entity property that swings each storage door: 0 is shut, 1 is open into the aisle
 * (ADR 0114, 0120). A new door fails to compile here until its property is declared.
 */
export const STORAGE_DOOR_PROPERTY = {
  sink: "cabinet_sink_door",
  stove: "cabinet_stove_door",
} as const satisfies Record<
  StorageDoorId,
  keyof typeof CAMPER_ENTITY.properties
>;

/** 0 is shut, 1 is swung fully open into the aisle (ADR 0114, 0120). */
export function storageDoorCommand(
  door: StorageDoorId,
  open: number,
): EngineCommand {
  return property(STORAGE_DOOR_PROPERTY[door], open);
}

/** Whether the ceiling lights glow (ADR 0115). */
export function ceilingLightsCommand(on: boolean): EngineCommand {
  return property("ceiling_lights", on);
}

/** The click of the light switch, as the headlight switch makes (ADR 0020, 0115). */
export const SWITCH_CLICK: EngineCommand = Object.freeze({
  type: "playSound",
  name: "random.click",
});
