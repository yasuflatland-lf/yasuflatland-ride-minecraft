import { uniformPattern } from "../../domain/build/edit/pattern";
import { planShape } from "../../domain/build/edit/plan";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  type ShapeStyle,
  shapeCount,
  shapeOf,
  stylesFor,
} from "../../domain/build/shape/shape";
import type { PlayerId } from "../../domain/shared/ids";
import { beginCheckedEdit } from "./beginCheckedEdit";
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
    if (flow.kind !== "selected") {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return;
    }
    const { box } = flow.selection;
    const shape = shapeOf(box.min, box.max);
    if (!stylesFor(shape).includes(cmd.style)) return;
    const count = shapeCount(shape, cmd.style);
    if (!beginCheckedEdit(session, this.feedback, cmd.playerId, count)) return;
    session.confirmBox(flow.selection, "selected");
    this.feedback.showMessage(
      cmd.playerId,
      "building",
      undefined,
      flow.selection.material,
    );
    this.jobs.start(
      cmd.playerId,
      flow.selection.dimensionId,
      planShape(shape, cmd.style, uniformPattern(flow.selection.material)),
      "undoable",
      { selectionBefore: box, selectionAfter: box },
    );
  }
}
