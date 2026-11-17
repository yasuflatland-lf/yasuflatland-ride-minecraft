import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class RotatePasteAim {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: { playerId: PlayerId }): "rotated" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "pasteAim" || !session.clipboard) {
      this.feedback.showMessage(cmd.playerId, "pasteInactive");
      return "ignored";
    }
    session.rotatePaste();
    return "rotated";
  }
}
