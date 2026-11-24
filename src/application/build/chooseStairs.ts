import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { StairOp } from "../../domain/build/stairs/contents";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseStairs {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId, op }: { playerId: PlayerId; op: StairOp }): void {
    const session = this.repo.getOrCreate(playerId);
    const refusal = session.chooseStairs(op);
    this.feedback.showMessage(playerId, refusal ?? "aimStairGoal");
  }
}
