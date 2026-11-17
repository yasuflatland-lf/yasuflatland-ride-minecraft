import type { Cell } from "../../domain/shared/cells";
import type { DimensionId } from "../../domain/shared/ids";
import { removeAt } from "../../domain/warp/warpRegistry";
import type { WarpRegistryStore } from "./ports/registryStore";

export class RemoveWarpPoint {
  constructor(private readonly store: WarpRegistryStore) {}

  run({ dimension, cell }: { dimension: DimensionId; cell: Cell }): void {
    const registry = this.store.load();
    if (!registry) return;
    const updated = removeAt(registry, dimension, cell);
    if (updated !== registry) this.store.save(updated);
  }
}
