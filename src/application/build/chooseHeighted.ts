import { chooseHeighted } from "../../domain/build/flow/heightFlow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { HeightedKind } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";
export class ChooseHeighted {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}
  execute(cmd: { playerId: PlayerId; kind: HeightedKind }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const previous = session.flow;
    const result = chooseHeighted(previous, cmd.kind);
    if ("refused" in result) {
      if (result.refused === "tooLarge")
        this.feedback.showMessage(cmd.playerId, result.refused);
      // Reapplying the existing flow preserves setFlow's build-mode activation.
      else session.setFlow(previous);
      return;
    }
    const { flow } = result;
    session.setFlow(flow);
    this.feedback.showMessage(
      cmd.playerId,
      "building",
      undefined,
      flow.material,
    );
  }
}
