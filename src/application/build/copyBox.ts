import { type CellBox, sizeOf, volume } from "../../domain/build/box";
import type { Clipboard } from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BoxAction } from "./boxAction";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildStructureStore } from "./ports/structures";

export class CopyBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const handle = this.structures.capture(dimensionId, box, playerId);
    if (handle === "tooLarge" || handle === "unreadable") {
      if (handle === "tooLarge")
        this.feedback.showMessage(playerId, "tooLarge", count);
      else this.feedback.showMessage(playerId, "copyUnreadable");
      return false;
    }
    const clipboard: Clipboard = {
      size: sizeOf(box),
      blockCount: count,
      contents: { kind: "structure", handle },
    };
    const session = this.repo.getOrCreate(playerId);
    const previous = session.completeCopy(dimensionId, box, clipboard);
    if (previous !== undefined) this.structures.discard(previous);
    this.feedback.showMessage(playerId, "copied", clipboard.blockCount);
    return true;
  }
}
