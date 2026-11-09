import type { ParasolId } from "../../domain/resort/ids";
import type { ParasolWorld } from "./ports/parasolWorld";

export class SyncParasolCeilings {
  constructor(private readonly world: Pick<ParasolWorld, "layCeiling">) {}
  execute(loaded: readonly ParasolId[]): void {
    for (const id of loaded) this.world.layCeiling(id);
  }
}
