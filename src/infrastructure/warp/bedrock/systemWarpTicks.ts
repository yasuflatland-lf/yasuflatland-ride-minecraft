import { system } from "@minecraft/server";
import type { WarpTicks } from "../../../application/warp/ports/ticks";
import type { Ticks } from "../../../domain/shared/ticks";

export class SystemWarpTicks implements WarpTicks {
  wait(duration: Ticks): Promise<void> {
    return new Promise((resolve) => system.runTimeout(resolve, duration));
  }
}
