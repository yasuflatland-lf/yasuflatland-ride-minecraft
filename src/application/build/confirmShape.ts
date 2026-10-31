import { boxOf } from "../../domain/build/box";
import { planShape } from "../../domain/build/edit/plan";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  type ShapeStyle,
  shapeCount,
  shapeOf,
  stylesFor,
} from "../../domain/build/shape/shape";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmShape {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}
  execute(cmd: { playerId: PlayerId; style: ShapeStyle }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const flow = session.flow;
    if (flow.kind !== "endpoint") {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return;
    }
    const shape = shapeOf(flow.from, flow.to);
    if (!stylesFor(shape).includes(cmd.style)) return;
    const count = shapeCount(shape, cmd.style);
    if (count > BUILD_SPEC.maxVolume) {
      this.feedback.showMessage(cmd.playerId, "tooLarge", count);
      return;
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(cmd.playerId, busy);
      return;
    }
    session.confirmBox(flow.dimensionId, boxOf(flow.from, flow.to));
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planShape(shape, cmd.style, { state: flow.material }),
      false,
    );
  }
}
