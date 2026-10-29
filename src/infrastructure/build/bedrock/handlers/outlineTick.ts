import { system } from "@minecraft/server";
import type { ShowOutline } from "../../../../application/build/showOutline";

export function registerOutlineTick(outline: ShowOutline): void {
  system.runInterval(() => outline.execute(system.currentTick), 1);
}
