// The game tick for the application layer's Clock port.
import { system } from "@minecraft/server";
import type { Clock } from "../../../application/vehicle/ports/shared";

export const systemClock: Clock = { now: () => system.currentTick };
