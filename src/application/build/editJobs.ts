// Applies queued edit plans in chunks, one shared budget per tick (ADR 0178).

import { sameBlockState } from "../../domain/build/blockState";
import type {
  AppliedChange,
  PlannedChange,
} from "../../domain/build/edit/change";
import { isKeptState } from "../../domain/build/edit/guard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

interface Job {
  readonly playerId: PlayerId;
  readonly dimensionId: DimensionId;
  readonly plan: Iterator<PlannedChange>;
  readonly undo: boolean;
  readonly applied: AppliedChange[];
}

export class EditJobs {
  private jobs: Job[] = [];

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}

  /** Queues a plan for the player's running edit (BuildSession.beginEdit already succeeded). */
  start(
    playerId: PlayerId,
    dimensionId: DimensionId,
    plan: Iterable<PlannedChange>,
    undo: boolean,
  ): void {
    this.jobs.push({
      playerId,
      dimensionId,
      plan: plan[Symbol.iterator](),
      undo,
      applied: [],
    });
  }

  /** Applies at most BUILD_SPEC.blocksPerTick planned changes across all jobs, round robin, oldest job first. */
  step(): void {
    let budget = BUILD_SPEC.blocksPerTick;
    while (budget > 0 && this.jobs.length > 0) {
      const share = Math.max(1, Math.ceil(budget / this.jobs.length));
      for (const job of [...this.jobs]) {
        if (budget <= 0) break;
        budget -= this.run(job, Math.min(share, budget));
      }
    }
  }

  /** Runs up to `limit` planned changes of one job and returns how many it consumed. */
  private run(job: Job, limit: number): number {
    const session = this.repo.get(job.playerId);
    if (!session) {
      this.drop(job);
      return 0;
    }
    let used = 0;
    while (used < limit) {
      const next = job.plan.next();
      if (next.done) {
        session.finishEdit(
          { dimensionId: job.dimensionId, changes: job.applied },
          job.undo,
        );
        this.feedback.showMessage(
          job.playerId,
          job.undo ? "undoDone" : "editDone",
          job.applied.length,
        );
        this.drop(job);
        return used;
      }
      used++;
      this.apply(job, next.value);
    }
    return used;
  }

  private apply(job: Job, change: PlannedChange): void {
    const { dimensionId } = job;
    const before = this.world.stateAt(dimensionId, change.cell);
    if (
      !before ||
      isKeptState(before) ||
      !this.world.mayEdit(dimensionId, change.cell) ||
      sameBlockState(before, change.after)
    ) {
      return;
    }
    if (this.world.setState(dimensionId, change.cell, change.after)) {
      job.applied.push({ cell: change.cell, before, after: change.after });
    }
  }

  private drop(job: Job): void {
    this.jobs = this.jobs.filter((j) => j !== job);
  }
}
