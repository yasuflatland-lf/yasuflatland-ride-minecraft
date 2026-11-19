import type { CellBox } from "../../../domain/build/box";
import type { QuarterTurn } from "../../../domain/build/rotation/quarterTurn";
import type { StructureHandle } from "../../../domain/build/structure/handle";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type CaptureRefusal = "tooLarge" | "unreadable";

/**
 * `copy` is for a clipboard: block types that must not be duplicated, such as
 * the Warp Block, are saved as air, because a pasted copy would hold no warp
 * registration. `exact` keeps every block, for Undo snapshots and the
 * selected-box rotation, which put the same blocks back or move them.
 */
export type CaptureMode = "copy" | "exact";

export interface BuildStructureStore {
  /** Saves the blocks and entities inside `box` as one structure. Players and this add-on's entities are not saved. Never throws. */
  capture(
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
    mode: CaptureMode,
  ): StructureHandle | CaptureRefusal;
  /** Places the structure with the minimum corner of its rotated box at `anchor`. False when the engine refuses. */
  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
    turn?: QuarterTurn,
  ): boolean;
  /** Removes entities inside `box`, except players and this add-on's entities. */
  clearEntities(dimensionId: DimensionId, box: CellBox): void;
  /** Sets every block inside `box` to air without drops, containers included. */
  clearBlocks(dimensionId: DimensionId, box: CellBox): boolean;
  /** Deletes the structure. Idempotent. */
  discard(handle: StructureHandle): void;
}
