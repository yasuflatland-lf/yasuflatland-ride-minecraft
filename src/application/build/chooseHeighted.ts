import {
  chooseHeighted,
  stairRoofFits,
} from "../../domain/build/flow/heightFlow";
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
    if (
      flow === previous &&
      previous.kind === "selected" &&
      !stairRoofFits(previous.selection, cmd.kind)
    ) {
      this.feedback.showMessage(cmd.playerId, "tooLarge");
      return;
    }
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
