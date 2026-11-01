import { chooseHeighted } from "../../domain/build/flow/flow";
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
    const flow = chooseHeighted(previous, cmd.kind);
    session.setFlow(flow);
    if (flow !== previous && flow.kind === "heightStep")
      this.feedback.showMessage(
        cmd.playerId,
        "building",
        undefined,
        flow.material,
      );
  }
}
