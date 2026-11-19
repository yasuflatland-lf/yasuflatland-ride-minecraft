// Use case: undo the player's last edit (ADR 0178).
import { type CellBox, cellsOf, sameBox, volume } from "../../domain/build/box";
import { undoPlan } from "../../domain/build/edit/change";
import { clearLastPaste } from "../../domain/build/flow/flow";
import { inDimension, withBox } from "../../domain/build/selection";
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

  execute(cmd: { playerId: PlayerId }): { restoredSelection?: CellBox } {
    const { playerId } = cmd;
    const session = this.repo.get(playerId);
    if (!session) {
      this.feedback.showMessage(playerId, "nothingToUndo");
      return {};
    }
    const entry = session.takeUndo();
    if (isEditRefusal(entry)) {
      this.feedback.showMessage(playerId, entry);
      return {};
    }
    const edit = entry.kind === "snapshot" ? entry.snapshot : entry.record;
    if (entry.kind === "snapshot") {
      const { dimensionId, box, handle } = entry.snapshot;
      for (const cell of cellsOf(box)) {
        if (!this.world.mayRestore(dimensionId, cell)) {
          session.putBackUndo(entry);
          this.feedback.showMessage(playerId, "pasteBlocked");
          return {};
        }
      }
      this.structures.clearEntities(dimensionId, box);
      const placed = this.structures.place(handle, dimensionId, box.min);
      this.structures.discard(handle);
      if (!placed) {
        this.log.warn(`Snapshot undo failed for ${playerId}: ${handle}`);
        this.feedback.showMessage(playerId, "undoFailed");
        return {};
      }
    } else {
      const record = entry.record;
      const busy = session.beginEdit();
      if (busy) {
        this.feedback.showMessage(playerId, busy);
        return {};
      }
      this.jobs.start(playerId, record.dimensionId, undoPlan(record), "undo");
    }
    const flow = session.flow;
    if (
      edit.selectionBefore &&
      flow.kind === "selected" &&
      inDimension(flow.selection, edit.dimensionId) &&
      (entry.kind === "snapshot" ||
        (entry.record.selectionAfter &&
          flow.selection === session.confirmedBox &&
          sameBox(flow.selection.box, entry.record.selectionAfter)))
    ) {
      session.replaceSelection(withBox(flow.selection, edit.selectionBefore));
    } else {
      // ADR 0203: undo must allow an immediate paste at the same anchor.
      session.setFlow(clearLastPaste(flow));
    }
    if (entry.kind === "snapshot")
      this.feedback.showMessage(
        playerId,
        "undoDone",
        volume(entry.snapshot.box),
      );
    return { restoredSelection: edit.selectionBefore };
  }
}
