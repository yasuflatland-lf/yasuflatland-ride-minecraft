import { planRoof } from "../../domain/build/edit/plan";
import { chooseRoofFill } from "../../domain/build/flow/flow";
import { roofCount } from "../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmRoof {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}
  execute(cmd: { playerId: PlayerId; hollow: boolean }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const flow = session.flow;
    if (flow.kind !== "roofHeight") {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return;
    }
    const spec = {
      base: flow.base,
      kind: flow.roofKind,
      height: flow.previous,
    };
    const count = roofCount(spec, cmd.hollow);
    if (count > BUILD_SPEC.maxVolume) {
      this.feedback.showMessage(cmd.playerId, "tooLarge", count);
      return;
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(cmd.playerId, busy);
      return;
    }
    session.setFlow(chooseRoofFill(flow, cmd.hollow));
    session.confirmBox(flow.dimensionId, {
      min: flow.base.min,
      max: { ...flow.base.max, y: flow.base.min.y + flow.previous - 1 },
    });
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planRoof(spec, cmd.hollow, { state: flow.material }),
      false,
    );
  }
}
