// Applies queued edit plans in chunks, one shared budget per tick (ADR 0178).

import { sameBlockState } from "../../domain/build/blockState";
import {
  type AppliedChange,
  type EditKind,
  type PlannedChange,
  type PlanStep,
  SCAN_STEP,
} from "../../domain/build/edit/change";
import { completionMessage } from "../../domain/build/edit/completion";
import { isKeptState } from "../../domain/build/edit/guard";
import { airPressOffersUndo } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import { cellKey } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { attempt } from "../shared/isolated";
import type { Logger } from "../shared/ports/logger";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import { unstuck } from "./unstuck";

interface Job {
  readonly playerId: PlayerId;
  readonly dimensionId: DimensionId;
  readonly plan: Iterator<PlanStep>;
  readonly kind: EditKind;
  readonly applied: AppliedChange[];
  buriedOwner: boolean;
  changed: number;
  skipped: number;
}

export class EditJobs {
  private jobs: Job[] = [];

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
    private readonly log: Logger,
    private readonly players: BuildPlayers,
  ) {}

  /** Queues a plan for the player's running edit (BuildSession.beginEdit already succeeded). */
  start(
    playerId: PlayerId,
    dimensionId: DimensionId,
    plan: Iterable<PlanStep>,
    kind: EditKind,
  ): void {
    this.jobs.push({
      playerId,
      dimensionId,
      plan: plan[Symbol.iterator](),
      kind,
      applied: [],
      buriedOwner: false,
      changed: 0,
      skipped: 0,
    });
  }

  /** Applies at most BUILD_SPEC.blocksPerTick plan steps (scans or writes) across all jobs, round robin, oldest job first. */
  step(): void {
    let budget = BUILD_SPEC.blocksPerTick;
    while (budget > 0 && this.jobs.length > 0) {
      const share = Math.max(1, Math.ceil(budget / this.jobs.length));
      for (const job of [...this.jobs]) {
        if (budget <= 0) break;
        let used = 0;
        const succeeded = attempt(
          () => {
            used = this.run(job, Math.min(share, budget));
          },
          this.log,
          () => `build edit job for ${job.playerId} failed`,
        );
        if (succeeded) {
          budget -= used;
        } else if (this.jobs.includes(job)) {
          this.drop(job);
          attempt(
            () => {
              this.repo
                .get(job.playerId)
                ?.finishEdit(
                  { dimensionId: job.dimensionId, changes: job.applied },
                  job.kind,
                );
            },
            this.log,
            () => `build edit history for ${job.playerId} failed`,
          );
        }
      }
    }
  }

  /** Runs up to `limit` plan steps of one job and returns how many it consumed. */
  private run(job: Job, limit: number): number {
    const session = this.repo.get(job.playerId);
    if (!session) {
      this.drop(job);
      return 0;
    }
    const occupant = this.players.occupantOf(job.playerId);
    const feet =
      occupant?.dimensionId === job.dimensionId ? occupant.feet : undefined;
    const occupiedCells = feet
      ? [cellKey(feet), cellKey({ ...feet, y: feet.y + 1 })]
      : [];
    let used = 0;
    while (used < limit) {
      const next = job.plan.next();
      if (next.done) {
        this.drop(job);
        session.finishEdit(
          { dimensionId: job.dimensionId, changes: job.applied },
          job.kind,
        );
        attempt(
          () => {
            if (job.buriedOwner)
              unstuck(this.world, this.players, job.playerId, job.dimensionId);
          },
          this.log,
          () => `build edit unstuck for ${job.playerId} failed`,
        );
        attempt(
          () => {
            // The job may finish after the player left the states where an air press offers Undo,
            // and an empty edit with no earlier history leaves nothing to undo.
            const { message, takesUndoHint } = completionMessage({
              kind: job.kind,
              skipped: job.skipped,
              flowOffersUndo:
                airPressOffersUndo(session.flow) && session.hasHistory,
            });
            if (message === "undoDonePartial") {
              this.feedback.showMessage(
                job.playerId,
                message,
                job.changed,
                undefined,
                job.skipped,
              );
            } else
              this.feedback.showMessage(job.playerId, message, job.changed);
            if (takesUndoHint && job.changed > 0 && session.takeUndoHint())
              this.feedback.showUndoHint(job.playerId);
          },
          this.log,
          () => `build edit feedback for ${job.playerId} failed`,
        );
        return used;
      }
      used++;
      if (next.value !== SCAN_STEP) this.apply(job, next.value, occupiedCells);
    }
    return used;
  }

  private apply(
    job: Job,
    change: PlannedChange,
    occupiedCells: readonly string[],
  ): void {
    const { dimensionId } = job;
    const before = this.world.stateAt(dimensionId, change.cell);
    if (!before) {
      if (job.kind === "undo") job.skipped++;
      return;
    }
    if (change.expected && !sameBlockState(before, change.expected)) {
      if (!sameBlockState(before, change.after)) job.skipped++;
      return;
    }
    if (sameBlockState(before, change.after)) return;
    if (isKeptState(before) || !this.world.mayEdit(dimensionId, change.cell)) {
      if (job.kind === "undo") job.skipped++;
      return;
    }
    if (this.world.setState(dimensionId, change.cell, change.after)) {
      job.changed++;
      if (occupiedCells.includes(cellKey(change.cell))) job.buriedOwner = true;
      if (job.kind === "undoable")
        job.applied.push({ cell: change.cell, before, after: change.after });
    } else if (job.kind === "undo") job.skipped++;
  }

  private drop(job: Job): void {
    this.jobs = this.jobs.filter((j) => j !== job);
  }
}
