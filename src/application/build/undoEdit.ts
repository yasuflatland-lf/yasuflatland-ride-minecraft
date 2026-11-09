// Use case: undo the player's last edit (ADR 0178).
import { undoPlan } from "../../domain/build/edit/change";
import { clearLastPaste } from "../../domain/build/flow/flow";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class UndoEdit {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const entry = session.takeUndo();
    if (isEditRefusal(entry)) {
      this.feedback.showMessage(playerId, entry);
      return;
    }
    if (entry.kind === "snapshot") {
      // Nothing records a snapshot yet; undoing one lands with paste and cut.
      throw new Error("Snapshot undo entries are not handled yet");
    }
    const record = entry.record;
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return;
    }
    this.jobs.start(playerId, record.dimensionId, undoPlan(record), "undo");
    // ADR 0203: undo must allow an immediate paste at the same anchor.
    session.setFlow(clearLastPaste(session.flow));
  }
}
