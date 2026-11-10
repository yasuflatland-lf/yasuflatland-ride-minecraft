import type { FurnitureId } from "../../../domain/resort/ids";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";

export interface FurnitureTopBlocksWorld {
  layTop(id: FurnitureId): void;
  clearTop(id: FurnitureId): void;
  blockAboveTop(id: FurnitureId): boolean;
  ownerAt(dimension: DimensionId, cell: Cell): FurnitureId | undefined;
}
