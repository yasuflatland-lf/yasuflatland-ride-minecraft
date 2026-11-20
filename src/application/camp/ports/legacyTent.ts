import type { TentId } from "../../../domain/camp/tent";
import type { TentEntry } from "../../../domain/camp/tentRegistry";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { TentRemovalWorld } from "./tentRemoval";

export interface LegacyTentWorld extends TentRemovalWorld {
  listTents(): readonly TentEntry[];
  anchorLoaded(entry: TentEntry): boolean;
  /** Dismounts players whose feet are in the given cells and teleports them to the centre of the exit. */
  ejectPlayers(
    dimensionId: DimensionId,
    cells: readonly Cell[],
    exit: Cell,
  ): void;
  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void;
}
