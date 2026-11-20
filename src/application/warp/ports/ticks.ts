import type { Ticks } from "../../../domain/shared/ticks";

export interface WarpTicks {
  wait(duration: Ticks): Promise<void>;
}
