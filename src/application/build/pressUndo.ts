import type { PlayerId } from "../../domain/shared/ids";
import type { StepBackSelection } from "./stepBackSelection";
import type { UndoEdit } from "./undoEdit";

export class PressUndo {
  constructor(
    private readonly stepBack: Pick<StepBackSelection, "execute">,
    private readonly undo: Pick<UndoEdit, "execute">,
  ) {}

  execute(cmd: { playerId: PlayerId }): "stepped" | "undone" {
    if (this.stepBack.execute(cmd) === "stepped") return "stepped";
    this.undo.execute(cmd);
    return "undone";
  }
}
