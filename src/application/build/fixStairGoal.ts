import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";

export class FixStairGoal {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): boolean {
    const session = this.repo.get(playerId);
    if (session?.flow.kind !== "stairAim") return false;
    const hit = this.aimReader.aim(playerId)?.block?.cell;
    if (!session.fixStairGoal(hit)) {
      this.feedback.showMessage(playerId, "noStairGoal");
      return false;
    }
    return true;
  }
}
