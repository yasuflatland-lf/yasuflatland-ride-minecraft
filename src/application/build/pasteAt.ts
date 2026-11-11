import { cellsOf } from "../../domain/build/box";
import type { PasteTarget } from "../../domain/build/clipboard/clipboard";
import { completionMessage } from "../../domain/build/edit/completion";
import { airPressOffersUndo } from "../../domain/build/flow/flow";
import { isRepeat, recordPaste } from "../../domain/build/flow/paste";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { discardAll } from "./discardAll";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import type { BuildStructureStore } from "./ports/structures";
import { unstuck } from "./unstuck";

export class PasteAt {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
    private readonly structures: BuildStructureStore,
    private readonly players: BuildPlayers,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    target: PasteTarget;
    tick: number;
  }): "pasted" | "refused" | "ignored" {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "pasteAim") return "ignored";
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return "refused";
    }
    const { anchor, box } = cmd.target;
    if (isRepeat(flow, anchor, cmd.tick, BUILD_SPEC.pasteRepeatTicks))
      return "ignored";
    for (const cell of cellsOf(box)) {
      if (!this.world.mayEdit(cmd.dimensionId, cell)) {
        this.feedback.showMessage(playerId, "pasteBlocked");
        return "refused";
      }
    }
    if (session.isEditing) {
      this.feedback.showMessage(playerId, "busy");
      return "refused";
    }
    const snapshot = this.structures.capture(cmd.dimensionId, box, playerId);
    if (snapshot === "tooLarge" || snapshot === "unreadable") {
      this.feedback.showMessage(playerId, "pasteFailed");
      return "refused";
    }
    this.structures.clearEntities(cmd.dimensionId, box);
    if (
      !this.structures.place(
        clipboard.contents.handle,
        cmd.dimensionId,
        anchor,
        cmd.target.turn,
      )
    ) {
      // A refused engine placement may already have placed some entities.
      this.structures.clearEntities(cmd.dimensionId, box);
      this.structures.place(snapshot, cmd.dimensionId, box.min);
      this.structures.discard(snapshot);
      this.feedback.showMessage(playerId, "pasteFailed");
      return "refused";
    }
    // Commit history only once placement succeeds, preserving earlier undo on failure.
    discardAll(
      this.structures,
      session.recordSnapshot({
        dimensionId: cmd.dimensionId,
        box,
        handle: snapshot,
      }),
    );
    session.setFlow(recordPaste(flow, anchor, cmd.tick));
    const { message, takesUndoHint } = completionMessage({
      kind: "undoable",
      skipped: 0,
      flowOffersUndo: airPressOffersUndo(session.flow) && session.hasHistory,
    });
    this.feedback.showMessage(playerId, message, clipboard.blockCount);
    if (takesUndoHint && clipboard.blockCount > 0 && session.takeUndoHint())
      this.feedback.showUndoHint(playerId);
    unstuck(this.world, this.players, playerId, cmd.dimensionId, box);
    return "pasted";
  }
}
