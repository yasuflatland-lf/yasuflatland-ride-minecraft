import type { CellBox } from "../../domain/build/box";
import type { Facing } from "../../domain/build/rotation/facing";
import type { BoxStepKind } from "../../domain/build/volume/kind";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";

export interface BoxAction {
  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    box: CellBox;
    facing: Facing;
  }): boolean;
}

export type BoxActions = Readonly<Record<BoxStepKind, BoxAction>>;
