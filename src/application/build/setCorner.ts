// Use case: set one corner of the selection (ADR 0178).
import { volume } from "../../domain/build/box";
import type { Corner } from "../../domain/build/selection/corner";
import { selectionBox } from "../../domain/build/selection/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";
import type { RiderGate } from "./ports/rider";

export interface SetCornerCommand {
  playerId: PlayerId;
  corner: Corner;
  dimensionId: DimensionId;
  cell: Cell;
}

export class SetCorner {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly gate: RiderGate,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: SetCornerCommand): void {
    if (!this.gate.ridesBulldozer(cmd.playerId)) {
      this.feedback.showMessage(cmd.playerId, "notInBulldozer");
      return;
    }
    const selection = this.repo
      .getOrCreate(cmd.playerId)
      .setCorner(cmd.corner, cmd.dimensionId, cmd.cell);
    const box = selectionBox(selection);
    this.feedback.showMessage(
      cmd.playerId,
      cmd.corner === "pos1" ? "pos1Set" : "pos2Set",
      box ? volume(box) : undefined,
    );
  }
}
