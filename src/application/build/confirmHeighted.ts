import { uniformPattern } from "../../domain/build/edit/pattern";
import { planHeighted } from "../../domain/build/edit/plan";
import { heightStepBox } from "../../domain/build/flow/flow";
import { selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { boundingBox, placementOf } from "../../domain/build/volume/geometry";
import { type FillStyle, fillStylesFor } from "../../domain/build/volume/kind";
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
      !Number.isInteger(flow.previous) ||
      flow.previous < 1 ||
      !fillStylesFor(flow.heightedKind).includes(cmd.fill)
    ) {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return;
    }
    const spec = {
      base: flow.base,
      kind: flow.heightedKind,
      height: flow.previous,
    };
    const count = placementOf(spec.kind).count(spec, cmd.fill);
    if (!beginCheckedEdit(session, this.feedback, cmd.playerId, count)) return;
    const selectionBefore = flow.heightLocked
      ? heightStepBox(flow)
      : (flow.selectionBefore ?? flow.base);
    const selection = selectionOf(
      flow.dimensionId,
      boundingBox(spec),
      flow.material,
    );
    session.confirmBox(selection, "selected");
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planHeighted(spec, cmd.fill, uniformPattern(flow.material)),
      "undoable",
      { selectionBefore, selectionAfter: selection.box },
    );
  }
}
