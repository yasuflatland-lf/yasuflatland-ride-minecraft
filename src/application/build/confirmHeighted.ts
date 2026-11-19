import { uniformPattern } from "../../domain/build/edit/pattern";
import { planHeighted } from "../../domain/build/edit/plan";
import { heightStepBox } from "../../domain/build/flow/flow";
import { isRoofKind } from "../../domain/build/roof/roof";
import { stairRoofPattern } from "../../domain/build/roof/stairRoof";
import { selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { stairMaterialOf } from "../../domain/build/stair";
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
      roofStyle: flow.roofStyle,
    };
    const count = placementOf(spec.kind).count(spec, cmd.fill);
    if (!beginCheckedEdit(session, this.feedback, cmd.playerId, count)) return;
    const selectionBefore =
      flow.selectionBefore ??
      (flow.heightLocked ? heightStepBox(flow) : flow.base);
    const stair =
      spec.roofStyle === "stair" ? stairMaterialOf(flow.material) : undefined;
    const pattern =
      stair && isRoofKind(spec.kind)
        ? stairRoofPattern({ ...spec, kind: spec.kind, style: "stair" }, stair)
        : uniformPattern(flow.material);
    const selection = selectionOf(
      flow.dimensionId,
      boundingBox(spec),
      flow.material,
    );
    session.confirmBox(selection, "selected");
    this.jobs.start(
      cmd.playerId,
      flow.dimensionId,
      planHeighted(spec, cmd.fill, pattern),
      "undoable",
      { selectionBefore, selectionAfter: selection.box },
    );
  }
}
