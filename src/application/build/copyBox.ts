import { type CellBox, volume } from "../../domain/build/box";
import { clipboardOf } from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BoxAction } from "./boxAction";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class CopyBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const clipboard = clipboardOf(box, (cell) =>
      this.world.stateAt(dimensionId, cell),
    );
    const session = this.repo.getOrCreate(playerId);
    session.completeCopy(dimensionId, box, clipboard);
    this.feedback.showMessage(playerId, "copied", clipboard.blockCount);
    return true;
  }
}
