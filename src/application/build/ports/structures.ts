import type { CellBox } from "../../../domain/build/box";
import type { StructureHandle } from "../../../domain/build/structure/handle";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type CaptureRefusal = "tooLarge" | "unreadable";

export interface BuildStructureStore {
  /** Saves the blocks and entities inside `box` as one structure. Players and this add-on's entities are not saved. Never throws. */
  capture(
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
  ): StructureHandle | CaptureRefusal;
  /** Places the structure with its minimum corner at `anchor`. False when the engine refuses. */
  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
  ): boolean;
  /** Removes entities inside `box`, except players and this add-on's entities. */
  clearEntities(dimensionId: DimensionId, box: CellBox): void;
  /** Sets every block inside `box` to air without drops, containers included. */
  clearBlocks(dimensionId: DimensionId, box: CellBox): boolean;
  /** Deletes the structure. Idempotent. */
  discard(handle: StructureHandle): void;
}
