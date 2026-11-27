import type { BlockTap } from "../../domain/build/blockTap";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

type StairPress = { playerId: PlayerId; quietTicks: number };

export class TapStairGoal {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  tap({ playerId, tap, quietTicks }: StairPress & { tap: BlockTap }): boolean {
    const result = this.repo.get(playerId)?.tapStairGoal(tap, quietTicks);
    if (result === "noGoal") this.feedback.showMessage(playerId, "noStairGoal");
    return result === "confirm";
  }

  confirm({ playerId, quietTicks }: StairPress): boolean {
    const result = this.repo.get(playerId)?.confirmStairGoal(quietTicks);
    if (result === "noGoal")
      this.feedback.showMessage(playerId, "stairTapGoal");
    return result === "confirm";
  }
}
