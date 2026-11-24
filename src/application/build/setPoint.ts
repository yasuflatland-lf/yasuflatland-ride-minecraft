import { volume } from "../../domain/build/box";
import { startOf } from "../../domain/build/flow/state";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
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
    if (
      flow.kind === "baseHeight" ||
      flow.kind === "selected" ||
      flow.kind === "heightStep" ||
      flow.kind === "pasteAim" ||
      flow.kind === "terrainConfirm"
    )
      return;
    const start = startOf(flow);
    const starting = start?.dimensionId !== cmd.dimensionId;
    const material = starting
      ? this.world.materialOf(cmd.dimensionId, cmd.cell)
      : start.material;
    if (material === "refused") {
      this.feedback.showMessage(cmd.playerId, "materialRefused");
      return;
    }
    const next = session.tapBlock(
      cmd.dimensionId,
      cmd.cell,
      material,
      this.world.heightRange(cmd.dimensionId),
    );
    if (next.kind === "baseHeight") {
      this.feedback.showMessage(cmd.playerId, "heightAim");
      return;
    }
    this.feedback.showMessage(
      cmd.playerId,
      next.kind === "selected" ? "endSet" : "pointSet",
      next.kind === "selected" ? volume(next.selection.box) : undefined,
    );
  }
}
