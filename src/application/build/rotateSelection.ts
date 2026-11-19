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
    const flow = this.repo.get(cmd.playerId)?.flow;
    if (
      flow?.kind !== "selected" ||
      !inDimension(flow.selection, cmd.dimensionId)
    ) {
      this.feedback.showMessage(cmd.playerId, "noSelection");
      return "noSelection";
    }
    return this.rotate.execute(cmd) === "rotated" ? "rotated" : "refused";
  }
}
