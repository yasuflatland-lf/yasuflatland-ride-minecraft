import { isFillMaterial } from "../../domain/build/edit/guard";
import { chooseStairs } from "../../domain/build/flow/stairFlow";
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
    const next = chooseStairs(session.flow, op);
    if (next === session.flow || next.kind !== "stairAim") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    if (op === "stairs" && !isFillMaterial(next.material)) {
      this.feedback.showMessage(playerId, "fillMaterialRefused");
      return;
    }
    session.setFlow(next);
    this.feedback.showMessage(playerId, "aimStairGoal");
  }
}
