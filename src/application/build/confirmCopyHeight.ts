import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { CopyBox } from "./copyBox";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmCopyHeight {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly copy: CopyBox,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "heightStep" || flow.heightedKind !== "copy") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const box = {
      min: flow.base.min,
      max: { ...flow.base.max, y: flow.base.min.y + flow.previous - 1 },
    };
    this.copy.execute(playerId, flow.dimensionId, box);
  }
}
