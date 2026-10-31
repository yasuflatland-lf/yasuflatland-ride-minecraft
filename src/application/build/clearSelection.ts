// Use case: forget the selection (ADR 0178).
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class ClearSelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    this.repo.get(cmd.playerId)?.clearSelection();
    this.feedback.showMessage(cmd.playerId, "selectionCleared");
  }
}
