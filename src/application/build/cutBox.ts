import { AIR } from "../../domain/build/blockState";
import { type CellBox, volume } from "../../domain/build/box";
import { clipboardOf } from "../../domain/build/clipboard/clipboard";
import { planShape } from "../../domain/build/edit/plan";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { beginCheckedEdit } from "./beginCheckedEdit";
import type { BoxAction } from "./boxAction";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

/** Copies the box into the clipboard, then empties it (ADR 0229). */
export class CutBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const count = volume(box);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "tooLarge", count);
      return false;
    }
    const session = this.repo.getOrCreate(playerId);
    if (!beginCheckedEdit(session, this.feedback, playerId, count))
      return false;
    // The clipboard is read before the first write, so it holds the cells as they were.
    const clipboard = clipboardOf(box, (cell) =>
      this.world.stateAt(dimensionId, cell),
    );
    session.completeCopy(dimensionId, box, clipboard);
    this.feedback.showMessage(playerId, "cutting");
    this.jobs.start(
      playerId,
      dimensionId,
      planShape(shapeOf(box.min, box.max), "fill", { state: AIR }),
      false,
    );
    return true;
  }
}
