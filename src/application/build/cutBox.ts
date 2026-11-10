import { type CellBox, cellsOf, volume } from "../../domain/build/box";
import { completionMessage } from "../../domain/build/edit/completion";
import { airPressOffersUndo } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Logger } from "../shared/ports/logger";
import type { BoxAction } from "./boxAction";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore } from "./ports/structures";

export class CutBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
    private readonly log: Logger,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const session = this.repo.getOrCreate(playerId);
    if (session.isEditing) {
      this.feedback.showMessage(playerId, "busy");
      return false;
    }
    for (const cell of cellsOf(box)) {
      if (!this.world.mayEdit(dimensionId, cell)) {
        this.feedback.showMessage(playerId, "pasteBlocked");
        return false;
      }
    }
    const handle = this.structures.capture(dimensionId, box, playerId);
    if (handle === "tooLarge" || handle === "unreadable") {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const snapshot = this.structures.capture(dimensionId, box, playerId);
    if (snapshot === "tooLarge" || snapshot === "unreadable") {
      this.structures.discard(handle);
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    this.structures.clearEntities(dimensionId, box);
    const cleared = this.structures.clearBlocks(dimensionId, box);
    if (!cleared && this.structures.place(snapshot, dimensionId, box.min)) {
      this.structures.discard(handle);
      this.structures.discard(snapshot);
      this.log.warn(`build cut for ${playerId} failed; area restored`);
      this.feedback.showMessage(playerId, "cutRestored");
      return false;
    }
    const previous = session.completeCopy(dimensionId, box, {
      size: {
        x: box.max.x - box.min.x + 1,
        y: box.max.y - box.min.y + 1,
        z: box.max.z - box.min.z + 1,
      },
      blockCount: count,
      contents: { kind: "structure", handle },
    });
    if (previous !== undefined) this.structures.discard(previous);
    for (const dropped of session.recordSnapshot({
      dimensionId,
      box,
      handle: snapshot,
    }))
      this.structures.discard(dropped);
    if (!cleared) {
      this.log.warn(
        `build cut for ${playerId} could not clear all blocks; snapshot retained for undo`,
      );
      this.feedback.showMessage(playerId, "cutIncomplete");
      return true;
    }
    const completion = completionMessage({
      kind: "undoable",
      skipped: 0,
      flowOffersUndo: airPressOffersUndo(session.flow) && session.hasHistory,
    });
    this.feedback.showMessage(playerId, completion.message, count);
    if (completion.takesUndoHint && session.takeUndoHint())
      this.feedback.showUndoHint(playerId);
    return true;
  }
}
