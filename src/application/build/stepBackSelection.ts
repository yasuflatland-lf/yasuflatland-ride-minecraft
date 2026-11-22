import { stepBackSelection } from "../../domain/build/flow/stepBack";
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
    const result = stepBackSelection(session.flow);
    if (!result) return "none";
    session.setFlow(result.flow);
    this.feedback.showMessage(
      playerId,
      result.cleared === "end" ? "endCleared" : "startCleared",
    );
    return "stepped";
  }
}
