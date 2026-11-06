import { planHeighted } from "../../domain/build/edit/plan";
import { finishHeightStep, heightStepBox } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { placementOf } from "../../domain/build/volume/geometry";
import {
  type FillStyle,
  fillStylesFor,
  isBoxStepKind,
} from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import { beginCheckedEdit } from "./beginCheckedEdit";
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
      isBoxStepKind(flow.heightedKind) ||
      !fillStylesFor(flow.heightedKind).includes(cmd.fill)
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
    const count = placementOf(spec.kind).count(spec, cmd.fill);
    if (!beginCheckedEdit(session, this.feedback, cmd.playerId, count)) return;
    session.setFlow(finishHeightStep(flow, hollow));
    session.confirmBox(flow.dimensionId, heightStepBox(flow));
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planHeighted(spec, cmd.fill, { state: flow.material }),
      "undoable",
    );
  }
}
