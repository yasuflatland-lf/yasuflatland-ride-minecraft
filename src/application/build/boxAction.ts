import type { Facing } from "../../domain/build/rotation/facing";
import type { Selection } from "../../domain/build/selection";
import type { Cell } from "../../domain/shared/cells";
import type { PlayerId } from "../../domain/shared/ids";

export type BoxActionCommand = {
  playerId: PlayerId;
  selection: Selection;
  facing: Facing;
  point1?: Cell;
};

export interface BoxAction {
  execute(cmd: BoxActionCommand): boolean;
}

export type BoxActions = Readonly<Record<"copy" | "cut", BoxAction>>;
