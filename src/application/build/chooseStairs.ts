import { isFillMaterial } from "../../domain/build/edit/guard";
import { chooseStairs } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseStairs {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const next = chooseStairs(session.flow);
    if (next === session.flow || next.kind !== "stairAim") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    if (!isFillMaterial(next.material)) {
      this.feedback.showMessage(playerId, "fillMaterialRefused");
      return;
    }
    session.setFlow(next);
    this.feedback.showMessage(playerId, "aimStairGoal");
  }
}
