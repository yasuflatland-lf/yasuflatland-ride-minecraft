import type { EngineCommand } from "../../drive";
import { commandsFor, type EntityContract } from "../../entityContract";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../motion/transformingEntity";
import { BULLDOZER_TRANSFORMING } from "./spec";

export const BULLDOZER_ENTITY = {
  properties: {
    ...transformingProperties(BULLDOZER_TRANSFORMING.maxBank),
    track_r: { type: "int", range: [0, 2] },
    track_l: { type: "int", range: [0, 2] },
    spin_r: { type: "float", range: [0, 360] },
    spin_l: { type: "float", range: [0, 360] },
    door: { type: "float", range: [0, 1] },
    /** 0 lowered, 1 raised; the drive animation lifts blade_rig and shortens the lift rods from it (ADR 0138). */
    blade: { type: "float", range: [0, 1] },
  },
  events: TRANSFORMING_EVENTS,
  animations: [],
  restored: ["form", "blade"],
} as const satisfies EntityContract;

const { property } = commandsFor<typeof BULLDOZER_ENTITY>();

export function trackPhaseCommand(
  side: "r" | "l",
  phase: 0 | 1 | 2,
): EngineCommand {
  return property(`track_${side}`, phase);
}

export function trackSpinCommand(side: "r" | "l", spin: number): EngineCommand {
  return property(`spin_${side}`, spin);
}

export function doorCommand(open: number): EngineCommand {
  return property("door", open);
}

/** The blade's height: 0 lowered (cutting position), 1 raised (ADR 0138). */
export function bladeCommand(lift: number): EngineCommand {
  return property("blade", lift);
}
