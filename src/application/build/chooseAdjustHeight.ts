import {
  adjustHeight,
  enteredBaseHeight,
} from "../../domain/build/flow/heightFlow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseAdjustHeight {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly world: Pick<BuildBlockWorld, "heightRange">,
  ) {}
  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.get(playerId);
    if (!session) return;
    const flow = session.flow;
    const next =
      flow.kind === "selected"
        ? adjustHeight(flow, this.world.heightRange(flow.selection.dimensionId))
        : flow;
    session.setFlow(next);
    if (enteredBaseHeight(flow, next))
      this.feedback.showMessage(playerId, "heightAim");
  }
}
