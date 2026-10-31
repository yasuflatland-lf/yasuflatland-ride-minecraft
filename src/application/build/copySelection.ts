// Use case: copy the selection into the clipboard in one tick (ADR 0178).
import { clipboardOf } from "../../domain/build/clipboard/clipboard";
import { isEditRefusal } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildAnchor } from "./ports/anchor";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class CopySelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly anchor: BuildAnchor,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const feet = this.anchor.feetOf(playerId);
    if (!feet) return;
    const session = this.repo.getOrCreate(playerId);
    const box = session.editableBox(BUILD_SPEC.maxCopyVolume);
    if (isEditRefusal(box)) {
      this.feedback.showMessage(playerId, box);
      return;
    }
    const dimensionId = session.selection?.dimensionId;
    if (!dimensionId) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const clipboard = clipboardOf(box, feet.cell, (cell) =>
      this.world.stateAt(dimensionId, cell),
    );
    session.setClipboard(clipboard);
    this.feedback.showMessage(playerId, "copied", clipboard.cells.length);
  }
}
