// Applies queued edit plans in chunks, one shared budget per tick (ADR 0178).

import {
  type EditKind,
  type EditRecord,
  type PlannedChange,
  type PlanStep,
  SCAN_STEP,
} from "../../domain/build/edit/change";
import {
  decideWrite,
  type EditTally,
  tallyWrite,
} from "../../domain/build/edit/decideWrite";
import type { BuildSession } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import { cellKey, cellOf } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { attempt } from "../shared/isolated";
import type { Logger } from "../shared/ports/logger";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import { reportEditCompletion } from "./snapshotEdit";
import { unstuck } from "./unstuck";

type EditSelection = Pick<
  EditRecord,
  "selectionBefore" | "selectionAfter" | "selectionBeforeTaps" | "keepEmpty"
>;

interface Job {
  readonly playerId: PlayerId;
  readonly dimensionId: DimensionId;
  readonly selection: EditSelection;
  readonly plan: Iterator<PlanStep>;
  readonly kind: EditKind;
  readonly tally: EditTally;
  buriedOwner: boolean;
}

function recordOf(job: Job): EditRecord {
  return {
    dimensionId: job.dimensionId,
    changes: job.tally.applied,
    ...job.selection,
  };
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
    selection: EditSelection = {},
  ): void {
    this.jobs.push({
      playerId,
      dimensionId,
      plan: plan[Symbol.iterator](),
      kind,
      selection,
      tally: { changed: 0, skipped: 0, applied: [] },
      buriedOwner: false,
    });
  }

  /** Applies at most BUILD_SPEC.blocksPerTick plan steps (scans or writes) across all jobs, round robin, oldest job first. */
  step(): void {
    let budget = BUILD_SPEC.blocksPerTick;
    while (budget > 0 && this.jobs.length > 0) {
      const share = Math.max(1, Math.ceil(budget / this.jobs.length));
      for (const job of [...this.jobs]) {
        if (budget <= 0) break;
        const session = this.repo.get(job.playerId);
        if (!session) {
          this.drop(job);
          continue;
        }
        this.repo.update(session, () => {
          const succeeded = attempt(
            () => {
              budget -= this.run(job, session, Math.min(share, budget));
            },
            this.log,
            () => `build edit job for ${job.playerId} failed`,
          );
          if (!succeeded && this.jobs.includes(job)) {
            this.drop(job);
            attempt(
              () => session.finishEdit(recordOf(job), job.kind),
              this.log,
              () => `build edit history for ${job.playerId} failed`,
            );
          }
        });
      }
    }
  }

  /** Runs up to `limit` plan steps of one job and returns how many it consumed. */
  private run(job: Job, session: BuildSession, limit: number): number {
    const occupant = this.players.occupantOf(job.playerId);
    const feet =
      occupant?.dimensionId === job.dimensionId ? occupant.feet : undefined;
    const occupiedCells = feet
      ? [cellKey(feet), cellKey(cellOf({ ...feet, y: feet.y + 1 }))]
      : [];
    let used = 0;
    while (used < limit) {
      const next = job.plan.next();
      if (next.done) {
        this.finishJob(job, session);
        return used;
      }
      used++;
      if (next.value !== SCAN_STEP) this.apply(job, next.value, occupiedCells);
    }
    return used;
  }

  private finishJob(job: Job, session: BuildSession): void {
    this.drop(job);
    session.finishEdit(recordOf(job), job.kind);
    attempt(
      () => {
        if (job.buriedOwner)
          unstuck(this.world, this.players, job.playerId, job.dimensionId);
      },
      this.log,
      () => `build edit unstuck for ${job.playerId} failed`,
    );
    attempt(
      () =>
        reportEditCompletion(
          session,
          this.feedback,
          job.playerId,
          job.kind,
          job.tally.changed,
          job.tally.skipped,
        ),
      this.log,
      () => `build edit feedback for ${job.playerId} failed`,
    );
  }

  private apply(
    job: Job,
    change: PlannedChange,
    occupiedCells: readonly string[],
  ): void {
    const { dimensionId, kind, tally } = job;
    const { cell, after } = change;
    const before = this.world.stateAt(dimensionId, cell);
    const decision = decideWrite(before, change, kind, () =>
      this.world.mayEdit(dimensionId, cell),
    );
    const outcome =
      decision !== "write"
        ? decision
        : this.world.setState(dimensionId, cell, after)
          ? "written"
          : "skip";
    const { changed, skipped, applied } = tallyWrite(
      kind,
      outcome,
      change,
      before,
    );
    tally.changed += changed;
    tally.skipped += skipped;
    if (changed && occupiedCells.includes(cellKey(cell)))
      job.buriedOwner = true;
    if (applied) tally.applied.push(applied);
  }

  private drop(job: Job): void {
    this.jobs = this.jobs.filter((j) => j !== job);
  }
}
