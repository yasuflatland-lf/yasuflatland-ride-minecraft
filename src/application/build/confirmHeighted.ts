import { planRoof } from "../../domain/build/edit/plan";
import { finishHeightStep } from "../../domain/build/flow/flow";
import { isRoofKind, roofCount } from "../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import { type FillStyle, fillStylesFor } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmHeighted {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}
  execute(cmd: { playerId: PlayerId; fill: FillStyle }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const flow = session.flow;
    if (
      flow.kind !== "heightStep" ||
      !fillStylesFor(flow.heightedKind).includes(cmd.fill) ||
      !isRoofKind(flow.heightedKind)
    ) {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return;
    }
    const hollow = cmd.fill === "hollow";
    const spec = {
      base: flow.base,
      kind: flow.heightedKind,
      height: flow.previous,
    };
    const count = roofCount(spec, hollow);
    if (count > BUILD_SPEC.maxVolume) {
      this.feedback.showMessage(cmd.playerId, "tooLarge", count);
      return;
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(cmd.playerId, busy);
      return;
    }
    session.setFlow(finishHeightStep(flow, hollow));
    session.confirmBox(flow.dimensionId, {
      min: flow.base.min,
      max: { ...flow.base.max, y: flow.base.min.y + flow.previous - 1 },
    });
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planRoof(spec, hollow, { state: flow.material }),
      false,
    );
  }
}
