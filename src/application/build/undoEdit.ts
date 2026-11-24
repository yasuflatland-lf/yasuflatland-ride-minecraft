// Use case: undo the player's last edit (ADR 0178).
import { volume } from "../../domain/build/box";
import { undoPlan } from "../../domain/build/edit/change";
import { selectionAfterUndo } from "../../domain/build/flow/selectionAfterUndo";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { Logger } from "../shared/ports/logger";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore } from "./ports/structures";
import { reportEditCompletion, SnapshotEdit } from "./snapshotEdit";

export class UndoEdit {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
    private readonly world: BuildBlockWorld,
    private readonly structures: BuildStructureStore,
    private readonly log: Logger,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const session = this.repo.get(playerId);
    if (!session) {
      this.feedback.showMessage(playerId, "nothingToUndo");
      return;
    }
    const entry = session.takeUndo();
    if (isEditRefusal(entry)) {
      this.feedback.showMessage(playerId, entry);
      return;
    }
    if (entry.kind === "snapshot") {
      const { dimensionId, box, handle } = entry.snapshot;
      const snapshotEdit = new SnapshotEdit(
        session,
        this.structures,
        this.feedback,
        {
          dimensionId,
          playerId,
        },
      );
      if (
        snapshotEdit.preflight(
          box,
          {
            allows: (cell) => this.world.mayRestore(dimensionId, cell),
            busy: "alreadyChecked",
          },
          () => {
            session.putBackUndo(entry);
            this.feedback.showMessage(playerId, "pasteBlocked");
          },
        )
      )
        return;
      if (!snapshotEdit.rollback(box, handle)) {
        this.log.warn(`Snapshot undo failed for ${playerId}: ${handle}`);
        this.feedback.showMessage(playerId, "undoFailed");
        return;
      }
    } else {
      const record = entry.record;
      const busy = session.beginEdit();
      if (busy) {
        this.feedback.showMessage(playerId, busy);
        return;
      }
      this.jobs.start(playerId, record.dimensionId, undoPlan(record), "undo");
    }
    const decision = selectionAfterUndo(
      entry,
      session.flow,
      session.confirmedBox,
      session.clipboard !== undefined,
    );
    if (decision) {
      if ("aimPaste" in decision) session.resumePasteAim();
      else
        session.replaceSelection(
          decision.restore.selection,
          decision.restore.taps,
          this.world.heightRange(decision.restore.selection.dimensionId),
        );
    }
    if (entry.kind === "snapshot")
      reportEditCompletion(
        session,
        this.feedback,
        playerId,
        "undo",
        volume(entry.snapshot.box),
        0,
      );
  }
}
