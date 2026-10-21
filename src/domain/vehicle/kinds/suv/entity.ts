import type { EngineCommand } from "../../drive";
import type { EntityContract } from "../../entityContract";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { SUV_SPEC } from "./spec";

export const SUV_ENTITY = {
  properties: transformingProperties(SUV_SPEC.maxBank),
  events: TRANSFORMING_EVENTS,
  animations: ["door_fr", "door_fl", "door_rr", "door_rl"],
  restored: ["form"],
} as const satisfies EntityContract;

/** Door bone name for each seat (ADR 0009). */
export const DOOR_BY_SEAT: readonly (typeof SUV_ENTITY.animations)[number][] =
  SUV_ENTITY.animations;

export function doorCommands(seat: number): EngineCommand[] {
  const name = DOOR_BY_SEAT[seat];
  return name === undefined
    ? []
    : [
        { type: "playAnimation", name },
        { type: "playSound", name: "random.door_open" },
      ];
}
