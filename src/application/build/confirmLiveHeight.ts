import { volume } from "../../domain/build/box";
import { confirmLiveHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmLiveHeight {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.get(playerId);
    if (session?.flow.kind !== "baseHeight") return;
    const next = confirmLiveHeight(session.flow);
    session.setFlow(next);
    this.feedback.showMessage(playerId, "endSet", volume(next.selection.box));
  }
}
