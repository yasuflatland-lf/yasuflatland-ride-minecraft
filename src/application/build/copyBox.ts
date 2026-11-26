import { volume } from "../../domain/build/box";
import { clipboardOf } from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { BoxAction, BoxActionCommand } from "./boxAction";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore } from "./ports/structures";

export class CopyBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: BoxActionCommand): boolean {
    const { playerId, selection } = cmd;
    const { dimensionId, box } = selection;
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const handle = this.structures.capture(dimensionId, box, playerId, "copy");
    if (handle === "tooLarge" || handle === "unreadable") {
      if (handle === "tooLarge")
        this.feedback.showMessage(playerId, "tooLarge", count);
      else this.feedback.showMessage(playerId, "copyUnreadable");
      return false;
    }
    const clipboard = clipboardOf({
      selection,
      facing: cmd.facing,
      point1: cmd.point1,
      handle,
    });
    this.repo.update(this.repo.getOrCreate(playerId), (session) => {
      session.completeCopy(selection, clipboard);
    });
    this.feedback.showMessage(playerId, "copied", clipboard.blockCount);
    return true;
  }
}
