import type { EngineCommand } from "../../drive";
import { commandsFor, type EntityContract } from "../../entityContract";
import { DOCK_EVENTS, DOCK_PROPERTIES } from "../../motion/dockEntity";
import { SPORTSBOAT_ATTITUDE } from "./attitude";

const { maxTrim, maxRoll } = SPORTSBOAT_ATTITUDE;

export const SPORTSBOAT_ENTITY = {
  properties: {
    trim: { type: "float", range: [0, maxTrim] },
    roll: { type: "float", range: [-maxRoll, maxRoll] },
    ...DOCK_PROPERTIES,
  },
  events: [...DOCK_EVENTS],
  animations: [],
  restored: ["docked"],
} as const satisfies EntityContract;

const { property } = commandsFor<typeof SPORTSBOAT_ENTITY>();

export function trimCommand(degrees: number): EngineCommand {
  return property("trim", degrees);
}

export function rollCommand(degrees: number): EngineCommand {
  return property("roll", degrees);
}
