import { AIR } from "../../domain/build/blockState";
import { type CellBox, volume } from "../../domain/build/box";
import { planShape } from "../../domain/build/edit/plan";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { beginCheckedEdit } from "./beginCheckedEdit";
import type { BoxAction } from "./boxAction";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class CutBox implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const session = this.repo.getOrCreate(playerId);
    if (!beginCheckedEdit(session, this.feedback, playerId, volume(box)))
      return false;
    session.confirmBox(dimensionId, box);
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
