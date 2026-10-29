// Use case: paste the clipboard at the bulldozer's feet (ADR 0178, Decision 7).
import { cellsOf } from "../../domain/build/box";
import { pasteBox } from "../../domain/build/clipboard/clipboard";
import { planPaste } from "../../domain/build/edit/plan";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { RiderGate } from "./ports/rider";

export class PasteClipboard {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly gate: RiderGate,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(cmd: { playerId: PlayerId; skipAir: boolean }): void {
    const { playerId } = cmd;
    const feet = this.gate.bulldozerFeet(playerId);
    if (!this.gate.ridesBulldozer(playerId) || !feet) {
      this.feedback.showMessage(playerId, "notInBulldozer");
      return;
    }
    const session = this.repo.getOrCreate(playerId);
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return;
    }
    const box = pasteBox(clipboard, feet.cell);
    for (const cell of cellsOf(box)) {
      if (!this.world.mayEdit(feet.dimensionId, cell)) {
        this.feedback.showMessage(playerId, "pasteBlocked");
        return;
      }
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return;
    }
    this.jobs.start(
      playerId,
      feet.dimensionId,
      planPaste(clipboard, feet.cell, cmd.skipAir),
      false,
    );
  }
}
