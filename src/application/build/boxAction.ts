import type { Facing } from "../../domain/build/rotation/facing";
import type { Selection } from "../../domain/build/selection";
import type { BoxStepKind } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";

export type BoxActionCommand = {
  playerId: PlayerId;
  selection: Selection;
  facing: Facing;
};

export interface BoxAction {
  execute(cmd: BoxActionCommand): boolean;
}

export type BoxActions = Readonly<Record<BoxStepKind, BoxAction>>;
