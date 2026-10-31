import { tapBlock } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeCount, shapeOf } from "../../domain/build/shape/shape";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class SetPoint {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}
  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    cell: Cell;
  }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const flow = session.flow;
    const starting =
      flow.kind === "idle" || flow.dimensionId !== cmd.dimensionId;
    const material = starting
      ? this.world.materialOf(cmd.dimensionId, cmd.cell)
      : flow.material;
    if (material === "refused") {
      this.feedback.showMessage(cmd.playerId, "materialRefused");
      return;
    }
    if (starting) session.clearSelection();
    const next = tapBlock(flow, cmd.dimensionId, cmd.cell, material);
    session.setFlow(next);
    this.feedback.showMessage(
      cmd.playerId,
      next.kind === "endpoint" ? "endSet" : "pointSet",
      next.kind === "endpoint"
        ? shapeCount(shapeOf(next.from, next.to), "fill")
        : undefined,
    );
  }
}
