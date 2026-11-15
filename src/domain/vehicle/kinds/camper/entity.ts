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
    fridge_top_door: { type: "float", range: [0, 1] },
    fridge_bottom_door: { type: "float", range: [0, 1] },
    drawer_top: { type: "float", range: [0, 1] },
    drawer_bottom: { type: "float", range: [0, 1] },
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
    "fridge_top_door",
    "fridge_bottom_door",
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

// #1684 removes this exclusion when it restores the declared drawer properties.
type GatedStorageDoorId = "drawer_top" | "drawer_bottom";

/**
 * The entity property that swings each storage door: 0 is shut, 1 is open into the aisle
 * (ADR 0114, 0121, 0123). Gated units wait for their pack property declarations.
 */
export const STORAGE_DOOR_PROPERTY = {
  sink: "cabinet_sink_door",
  stove: "cabinet_stove_door",
  fridge_top: "fridge_top_door",
  fridge_bottom: "fridge_bottom_door",
} as const satisfies Record<
  Exclude<StorageDoorId, GatedStorageDoorId>,
  keyof typeof CAMPER_ENTITY.properties
>;

/** Gated units get their restored entity properties with their pack wiring (#1684). */
export function storageDoorProperty(
  door: StorageDoorId,
): (typeof CAMPER_ENTITY.restored)[number] | undefined {
  const properties: Partial<
    Record<StorageDoorId, (typeof CAMPER_ENTITY.restored)[number]>
  > = STORAGE_DOOR_PROPERTY;
  return properties[door];
}

/** 0 is shut, 1 is swung fully open into the aisle (ADR 0114, 0121). */
export function storageDoorCommand(
  door: StorageDoorId,
  open: number,
): EngineCommand {
  const name = storageDoorProperty(door);
  if (name === undefined)
    throw new Error(`Storage property is not wired: ${door}`);
  return property(name, open);
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
