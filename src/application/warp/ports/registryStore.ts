import type { WarpRegistry } from "../../../domain/warp/warpRegistry";

export interface WarpRegistryStore {
  /** Undefined means unreadable data that must not be overwritten. */
  load(): WarpRegistry | undefined;
  save(registry: WarpRegistry): void;
}
