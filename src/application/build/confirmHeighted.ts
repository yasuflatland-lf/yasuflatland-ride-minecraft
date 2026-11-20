import { uniformPattern } from "../../domain/build/edit/pattern";
import { planHeighted } from "../../domain/build/edit/plan";
import { cornerTaps, heightStepBox } from "../../domain/build/flow/flow";
import { isRoofKind } from "../../domain/build/roof/roof";
import { stairRoofPattern } from "../../domain/build/roof/stairRoof";
import { type Selection, selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { stairMaterialOf } from "../../domain/build/stair";
import { boundingBox, placementOf } from "../../domain/build/volume/geometry";
import { type FillStyle, fillStylesFor } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";
import { startUndoableBuild } from "./startUndoableBuild";

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
    const selectionBefore =
      flow.selectionBefore ??
      (flow.heightLocked ? heightStepBox(flow) : flow.base);
    const stair =
      spec.roofStyle === "stair" ? stairMaterialOf(flow.material) : undefined;
    const pattern =
      stair && isRoofKind(spec.kind)
        ? stairRoofPattern({ ...spec, kind: spec.kind, style: "stair" }, stair)
        : uniformPattern(flow.material);
    // Finding the bounds of a curved solid scans its cells, so wait for the volume and busy checks.
    let selection: Selection | undefined;
    const selectedBounds = () =>
      (selection ??= selectionOf(
        flow.dimensionId,
        boundingBox(spec),
        flow.material,
      ));
    startUndoableBuild(
      { feedback: this.feedback, jobs: this.jobs },
      {
        playerId: cmd.playerId,
        session,
        count,
        plan: planHeighted(spec, cmd.fill, pattern),
        selectionBefore,
        get after() {
          return selectedBounds();
        },
        get taps() {
          return cornerTaps(selectedBounds().box);
        },
      },
    );
  }
}
