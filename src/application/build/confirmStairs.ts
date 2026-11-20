import { boxOf } from "../../domain/build/box";
import { planStairs } from "../../domain/build/edit/plan";
import { selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  rolesOf,
  type StairContents,
} from "../../domain/build/stairs/contents";
import { stairCellCount } from "../../domain/build/stairs/roles";
import { goalRowTaps } from "../../domain/build/stairs/staircase";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";
import { startUndoableBuild } from "./startUndoableBuild";

export class ConfirmStairs {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute({
    playerId,
    contents,
  }: {
    playerId: PlayerId;
    contents: StairContents;
  }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "stairContents") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const { staircase, dimensionId, material, selectionBefore } = flow;
    const roles = rolesOf(contents);
    const taps = goalRowTaps(staircase);
    if (
      startUndoableBuild(
        { feedback: this.feedback, jobs: this.jobs },
        {
          playerId,
          session,
          count: stairCellCount(staircase, roles),
          plan: planStairs(staircase, roles, material),
          selectionBefore,
          selectionBeforeTaps: flow.taps,
          after: selectionOf(dimensionId, boxOf(taps.from, taps.to), material),
          taps,
        },
      )
    )
      this.feedback.showMessage(playerId, "building", undefined, material);
  }
}
