import { system } from "@minecraft/server";
import type { WarpTicks } from "../../../application/warp/ports/ticks";

export class SystemWarpTicks implements WarpTicks {
  wait(ticks: number): Promise<void> {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
  }
}
