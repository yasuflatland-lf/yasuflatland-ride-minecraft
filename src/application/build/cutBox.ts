import { sizeOf, volume } from "../../domain/build/box";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { Logger } from "../shared/ports/logger";
import type { BoxAction, BoxActionCommand } from "./boxAction";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore, CaptureRefusal } from "./ports/structures";
import {
  isCaptureRefusal,
  reportEditCompletion,
  SnapshotEdit,
} from "./snapshotEdit";

export class CutBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
    private readonly log: Logger,
  ) {}

  execute(cmd: BoxActionCommand): boolean {
    const { playerId, selection } = cmd;
    const { dimensionId, box } = selection;
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const session = this.repo.getOrCreate(playerId);
    const edit = new SnapshotEdit(session, this.structures, this.feedback, {
      dimensionId,
      playerId,
    });
    if (
      edit.preflight(
        box,
        {
          allows: (cell) => this.world.mayEdit(dimensionId, cell),
          busy: "beforeProtection",
        },
        () => this.feedback.showMessage(playerId, "pasteBlocked"),
      )
    )
      return false;
    const reportCaptureRefusal = (reason: CaptureRefusal) => {
      if (reason === "tooLarge")
        this.feedback.showMessage(playerId, "tooLarge", count);
      else this.feedback.showMessage(playerId, "copyUnreadable");
    };
    const handle = this.structures.capture(dimensionId, box, playerId, "copy");
    if (isCaptureRefusal(handle)) {
      reportCaptureRefusal(handle);
      return false;
    }
    const snapshot = edit.captureExact(box, (reason) => {
      this.structures.discard(handle);
      reportCaptureRefusal(reason);
    });
    if (snapshot === undefined) return false;
    const cleared = edit.clear(box);
    if (
      !cleared &&
      edit.rollback(box, snapshot, {
        clearEntities: false,
        retainOnFailure: true,
        discardWithSnapshot: handle,
      })
    ) {
      this.log.warn(`build cut for ${playerId} failed; area restored`);
      this.feedback.showMessage(playerId, "cutRestored");
      return false;
    }
    const previous = session.completeCopy(selection, {
      material: selection.material,
      facing: cmd.facing,
      size: sizeOf(box),
      blockCount: count,
      contents: { kind: "structure", handle },
    });
    if (previous !== undefined) this.structures.discard(previous);
    edit.commit({ box, handle: snapshot });
    if (!cleared) {
      this.log.warn(
        `build cut for ${playerId} could not clear all blocks; snapshot retained for undo`,
      );
      this.feedback.showMessage(playerId, "cutIncomplete");
      return true;
    }
    reportEditCompletion(
      session,
      this.feedback,
      playerId,
      "undoable",
      count,
      0,
    );
    return true;
  }
}
