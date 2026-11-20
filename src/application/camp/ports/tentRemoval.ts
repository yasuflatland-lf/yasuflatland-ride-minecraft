import type { TentId } from "../../../domain/camp/tent";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";

export interface TentRemovalWorld {
  /** Clears the blocks tracked by the cell layer in loaded chunks. */
  unlayBlocks(tentId: TentId): void;
  entityLoaded(tentId: TentId): boolean;
  /** Clears matching blocks from the current layout using the registry pose, if present. */
  clearBlocksByPose(tentId: TentId): void;
  /** Clears only yasu_ride:tent_* blocks in readable cells. */
  clearTentBlocks(dimensionId: DimensionId, cells: readonly Cell[]): void;
  removeTent(tentId: TentId): void;
}
