// Use case: copy the selection into the clipboard in one tick (ADR 0178).
import { clipboardOf } from "../../domain/build/clipboard/clipboard";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { RiderGate } from "./ports/rider";

export class CopySelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly gate: RiderGate,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const feet = this.gate.bulldozerFeet(playerId);
    if (!this.gate.ridesBulldozer(playerId) || !feet) {
      this.feedback.showMessage(playerId, "notInBulldozer");
      return;
    }
    const session = this.repo.getOrCreate(playerId);
    const box = session.editableBox(BUILD_SPEC.maxCopyVolume);
    const dimensionId = session.selection?.dimensionId;
    if (isEditRefusal(box) || !dimensionId) {
      this.feedback.showMessage(
        playerId,
        isEditRefusal(box) ? box : "noSelection",
      );
      return;
    }
    const clipboard = clipboardOf(box, feet.cell, (cell) =>
      this.world.stateAt(dimensionId, cell),
    );
    session.setClipboard(clipboard);
    this.feedback.showMessage(playerId, "copied", clipboard.cells.length);
  }
}
