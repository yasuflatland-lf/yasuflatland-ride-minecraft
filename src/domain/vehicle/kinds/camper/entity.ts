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
  },
  events: [...TRANSFORMING_EVENTS, ...DOCK_EVENTS],
  animations: [],
  restored: ["form", "docked", "door"],
} as const satisfies EntityContract;

const { property } = commandsFor<typeof CAMPER_ENTITY>();

/** 0 is shut, 1 is swung fully open. */
export function doorCommand(open: number): EngineCommand {
  return property("door", open);
}
