import type { CellBox } from "../../domain/build/box";
import type { BoxStepKind } from "../../domain/build/volume/kind";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";

export interface BoxAction {
  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean;
}

export type BoxActions = Readonly<Record<BoxStepKind, BoxAction>>;
