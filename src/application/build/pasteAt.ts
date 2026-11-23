import type { PasteTarget } from "../../domain/build/clipboard/clipboard";
import { selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import type { BuildStructureStore } from "./ports/structures";
import { reportEditCompletion, SnapshotEdit } from "./snapshotEdit";
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
  }): "pasted" | "refused" | "ignored" {
    const { playerId, dimensionId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    if (session.flow.kind !== "pasteAim") return "ignored";
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return "refused";
    }
    const { anchor, box, turn } = cmd.target;
    const edit = new SnapshotEdit(session, this.structures, this.feedback, cmd);
    if (
      edit.preflight(
        box,
        {
          allows: (cell) => this.world.mayEdit(dimensionId, cell),
          busy: "afterProtection",
        },
        () => this.feedback.showMessage(playerId, "pasteBlocked"),
      )
    )
      return "refused";
    const reportFailure = () =>
      this.feedback.showMessage(playerId, "pasteFailed");
    const snapshot = edit.captureExact(box, reportFailure);
    if (snapshot === undefined) return "refused";
    this.structures.clearEntities(dimensionId, box);
    if (
      !this.structures.place(
        clipboard.contents.handle,
        dimensionId,
        anchor,
        turn,
      )
    ) {
      // A refused engine placement may already have placed some entities.
      edit.rollback(box, snapshot);
      reportFailure();
      return "refused";
    }
    // Commit history only once placement succeeds, preserving earlier undo on failure.
    this.repo.update(session, (session) => {
      edit.commit({ box, handle: snapshot, paste: true });
      session.selectPasted(selectionOf(dimensionId, box, clipboard.material));
    });
    reportEditCompletion(
      session,
      this.feedback,
      playerId,
      "undoable",
      clipboard.blockCount,
      0,
    );
    unstuck(this.world, this.players, playerId, dimensionId, box);
    return "pasted";
  }
}
