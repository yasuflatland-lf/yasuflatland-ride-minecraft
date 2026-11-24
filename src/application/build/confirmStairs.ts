import { boxOf } from "../../domain/build/box";
import { planStairs } from "../../domain/build/edit/plan";
import { selectionOf } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  rolesOf,
  type StairContents,
  type StairOp,
  TERRACE_ROLES,
} from "../../domain/build/stairs/contents";
import {
  type StairRole,
  stairCellCount,
} from "../../domain/build/stairs/roles";
import { goalRowTaps } from "../../domain/build/stairs/staircase";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import { startUndoableBuild } from "./startUndoableBuild";

abstract class StairEdit {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
    private readonly blocks: Pick<BuildBlockWorld, "heightRange">,
  ) {}

  protected confirm(
    playerId: PlayerId,
    op: StairOp,
    roles: ReadonlySet<StairRole>,
  ): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "stairContents" || flow.op !== op) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const { staircase, start, selectionBefore } = flow;
    const { dimensionId, material } = start;
    const taps = goalRowTaps(staircase);
    const range = this.blocks.heightRange(dimensionId);
    if (
      startUndoableBuild(
        { feedback: this.feedback, jobs: this.jobs },
        {
          playerId,
          session,
          count: stairCellCount(staircase, roles, range),
          plan: planStairs(staircase, roles, material, range),
          selectionBefore,
          selectionBeforeTaps: flow.taps,
          keepEmpty: true,
          after: selectionOf(dimensionId, boxOf(taps.from, taps.to), material),
          taps,
        },
      )
    ) {
      if (op === "stairs")
        this.feedback.showMessage(playerId, "building", undefined, material);
      else this.feedback.showMessage(playerId, "removing");
    }
  }
}

export class ConfirmStairs extends StairEdit {
  execute({
    playerId,
    contents,
  }: {
    playerId: PlayerId;
    contents: StairContents;
  }): void {
    this.confirm(playerId, "stairs", rolesOf(contents));
  }
}

export class ConfirmTerrace extends StairEdit {
  execute({ playerId }: { playerId: PlayerId }): void {
    this.confirm(playerId, "terrace", TERRACE_ROLES);
  }
}
