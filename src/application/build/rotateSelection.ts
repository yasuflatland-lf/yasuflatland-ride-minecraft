import { confirmTappedSpan } from "../../domain/build/flow/flow";
import { inDimension } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";
import type { RotateBox } from "./rotateBox";

export class RotateSelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly rotate: Pick<RotateBox, "execute">,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
  }): "rotated" | "refused" | "noSelection" {
    const session = this.repo.get(cmd.playerId);
    const flow = session?.flow;
    if (
      !session ||
      (flow?.kind !== "selected" && flow?.kind !== "baseHeight") ||
      !inDimension(flow.selection, cmd.dimensionId)
    ) {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return "noSelection";
    }
    if (flow.kind === "baseHeight") session.setFlow(confirmTappedSpan(flow));
    return this.rotate.execute(cmd) === "rotated" ? "rotated" : "refused";
  }
}
