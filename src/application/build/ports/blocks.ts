import type { BlockState } from "../../../domain/build/blockState";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";

export interface BuildBlockWorld {
  /** The block state at `cell`; undefined when unreadable (unloaded, outside the world). */
  stateAt(dimensionId: DimensionId, cell: Cell): BlockState | undefined;
  /** Sets the block without drops; false when the cell is unreadable or the engine refuses. */
  setState(dimensionId: DimensionId, cell: Cell, state: BlockState): boolean;
  /** False for a cell a vehicle or a tent claims or a block tagged yasu_ride:laid (ADR 0178, Decision 6). */
  mayEdit(dimensionId: DimensionId, cell: Cell): boolean;
}
