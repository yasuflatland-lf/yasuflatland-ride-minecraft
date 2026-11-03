import type { TentEntry } from "../../../domain/camp/tentRegistry";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import type { TentWorld } from "./tent";

export interface LegacyTentWorld
  extends Pick<TentWorld, "typeIdAt" | "returnTentItem"> {
  listTents(): readonly TentEntry[];
  ejectOccupants(entry: TentEntry): void;
  clearTentBlock(dimensionId: DimensionId, cell: Cell): void;
  /** Removes registry, flap state, and entity without consulting the current layout. */
  removeLegacyTent(entry: TentEntry): void;
}
