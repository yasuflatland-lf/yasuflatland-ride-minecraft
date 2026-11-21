import { adjustHeight, enteredBaseHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

import type { BuildFeedback } from "./ports/feedback";

export class ChooseAdjustHeight {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}
  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.get(playerId);
    if (!session) return;
    const flow = session.flow;
    const next = adjustHeight(flow);
    session.setFlow(next);
    if (enteredBaseHeight(flow, next))
      this.feedback.showMessage(playerId, "heightAim");
  }
}
