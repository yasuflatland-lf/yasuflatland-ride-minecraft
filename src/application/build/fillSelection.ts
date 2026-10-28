// Use case: fill the selection with one block (ADR 0178).
import type { Pattern } from "../../domain/build/edit/pattern";
import { planFill } from "../../domain/build/edit/plan";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";
import type { RiderGate } from "./ports/rider";

export class FillSelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly gate: RiderGate,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(cmd: { playerId: PlayerId; pattern: Pattern }): void {
    const { playerId } = cmd;
    if (!this.gate.ridesBulldozer(playerId)) {
      this.feedback.showMessage(playerId, "notInBulldozer");
      return;
    }
    const session = this.repo.getOrCreate(playerId);
    const box = session.editableBox(BUILD_SPEC.maxVolume);
    if (isEditRefusal(box)) {
      this.feedback.showMessage(playerId, box);
      return;
    }
    // editableBox succeeded, so the selection exists.
    const dimensionId = session.selection?.dimensionId;
    if (!dimensionId) return;
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return;
    }
    this.jobs.start(playerId, dimensionId, planFill(box, cmd.pattern), false);
  }
}
