import { chooseHeighted } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BoxActions } from "./boxAction";
import type { FacingReader } from "./ports/facing";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseBoxStep {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly actions: BoxActions,
    private readonly feedback: BuildFeedback,
    private readonly facing: FacingReader,
  ) {}

  execute({
    playerId,
    kind,
  }: {
    playerId: PlayerId;
    kind: keyof BoxActions;
  }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "selected") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const facing = this.facing.facingOf(playerId);
    if (kind === "rotate") {
      const next = chooseHeighted(flow, kind, facing);
      if (next.kind === "heightStep") {
        session.setFlow(next);
        return;
      }
    }
    this.actions[kind].execute({
      playerId,
      selection: flow.selection,
      facing,
    });
  }
}
