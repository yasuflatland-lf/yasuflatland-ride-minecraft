import { heightStepBox } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { isBoxStepKind } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import type { BoxActions } from "./boxAction";
import type { FacingReader } from "./ports/facing";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmBoxStep {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly actions: BoxActions,
    private readonly feedback: BuildFeedback,
    private readonly facing: FacingReader,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "heightStep" || !isBoxStepKind(flow.heightedKind)) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    this.actions[flow.heightedKind].execute({
      playerId,
      dimensionId: flow.dimensionId,
      box: heightStepBox(flow),
      facing: flow.facing ?? this.facing.facingOf(playerId),
    });
  }
}
