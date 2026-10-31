// Use case: undo the player's last edit (ADR 0178).
import { undoPlan } from "../../domain/build/edit/change";
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
    const record = session.takeUndo();
    if (isEditRefusal(record)) {
      this.feedback.showMessage(playerId, record);
      return;
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return;
    }
    this.jobs.start(playerId, record.dimensionId, undoPlan(record), true);
  }
}
