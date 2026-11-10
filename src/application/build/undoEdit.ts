// Use case: undo the player's last edit (ADR 0178).
import { cellsOf, volume } from "../../domain/build/box";
import { undoPlan } from "../../domain/build/edit/change";
import { clearLastPaste } from "../../domain/build/flow/flow";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { Logger } from "../shared/ports/logger";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore } from "./ports/structures";

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
    const session = this.repo.getOrCreate(playerId);
    const entry = session.takeUndo();
    if (isEditRefusal(entry)) {
      this.feedback.showMessage(playerId, entry);
      return;
    }
    if (entry.kind === "snapshot") {
      const { dimensionId, box, handle } = entry.snapshot;
      for (const cell of cellsOf(box)) {
        if (!this.world.mayEdit(dimensionId, cell)) {
          session.putBackUndo(entry);
          this.feedback.showMessage(playerId, "pasteBlocked");
          return;
        }
      }
      this.structures.clearEntities(dimensionId, box);
      const placed = this.structures.place(handle, dimensionId, box.min);
      this.structures.discard(handle);
      if (!placed) {
        this.log.warn(`Snapshot undo failed for ${playerId}: ${handle}`);
        this.feedback.showMessage(playerId, "undoFailed");
        return;
      }
      session.setFlow(clearLastPaste(session.flow));
      this.feedback.showMessage(playerId, "undoDone", volume(box));
      return;
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
