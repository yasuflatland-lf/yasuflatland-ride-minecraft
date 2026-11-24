import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class StepBackSelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): "stepped" | "none" {
    const session = this.repo.get(playerId);
    if (!session) return "none";
    const cleared = session.stepBack();
    if (!cleared) return "none";
    this.feedback.showMessage(
      playerId,
      cleared === "end" ? "endCleared" : "startCleared",
    );
    return "stepped";
  }
}
