import type { EngineCommand } from "../../drive";
import { commandsFor, type EntityContract } from "../../entityContract";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { SCOOTER_SPEC } from "./spec";

export const SCOOTER_ENTITY = {
  properties: {
    ...transformingProperties(SCOOTER_SPEC.maxBank),
    lean: {
      type: "float",
      range: [-SCOOTER_SPEC.maxLean, SCOOTER_SPEC.maxLean],
    },
    steer: {
      type: "float",
      range: [-SCOOTER_SPEC.maxSteer, SCOOTER_SPEC.maxSteer],
    },
    stand: { type: "bool" },
  },
  events: TRANSFORMING_EVENTS,
  animations: [],
  restored: ["form"],
} as const satisfies EntityContract;

const { property } = commandsFor<typeof SCOOTER_ENTITY>();
export function leanCommand(angle: number): EngineCommand {
  return property("lean", angle);
}
export function steerCommand(angle: number): EngineCommand {
  return property("steer", angle);
}
export function standCommand(down: boolean): EngineCommand {
  return property("stand", down);
}
