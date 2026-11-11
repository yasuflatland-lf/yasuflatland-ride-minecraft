import { cellsOf, volume } from "../../domain/build/box";
import { selectionBoxOf } from "../../domain/build/flow/flow";
import { planRotationAboutCenter } from "../../domain/build/rotation/rotateBox";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Logger } from "../shared/ports/logger";
import { discardAll } from "./discardAll";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import type { BuildStructureStore } from "./ports/structures";
import { unstuck } from "./unstuck";

export class RotateBox {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly players: BuildPlayers,
    private readonly structures: BuildStructureStore,
    private readonly feedback: BuildFeedback,
    private readonly log: Logger,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
  }): "rotated" | "refused" | "busy" | "ignored" {
    const { playerId, dimensionId } = cmd;
    const session = this.repo.get(playerId);
    if (!session) return "ignored";
    const flow = session.flow;
    if (flow.kind !== "endpoint" || flow.dimensionId !== dimensionId)
      return "ignored";
    const selectedBox = selectionBoxOf(flow);
    if (!selectedBox) return "ignored";
    const plan = planRotationAboutCenter(selectedBox);
    const count = volume(plan.union);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "rotateTooLarge", count);
      return "refused";
    }
    if (session.isEditing) {
      this.feedback.showMessage(playerId, "busy");
      return "busy";
    }
    for (const cell of cellsOf(plan.union)) {
      if (!this.world.mayEdit(dimensionId, cell)) {
        this.feedback.showMessage(playerId, "rotateBlocked");
        return "refused";
      }
    }
    const snapshot = this.structures.capture(dimensionId, plan.union, playerId);
    if (snapshot === "tooLarge" || snapshot === "unreadable") {
      this.feedback.showMessage(playerId, "rotateTooLarge", count);
      return "refused";
    }
    const source = this.structures.capture(dimensionId, selectedBox, playerId);
    if (source === "tooLarge" || source === "unreadable") {
      this.structures.discard(snapshot);
      this.feedback.showMessage(playerId, "rotateTooLarge", count);
      return "refused";
    }
    this.structures.clearEntities(dimensionId, selectedBox);
    const cleared = this.structures.clearBlocks(dimensionId, selectedBox);
    if (
      !cleared ||
      !this.structures.place(source, dimensionId, plan.target.min, 1)
    ) {
      this.structures.clearEntities(dimensionId, plan.union);
      this.structures.place(snapshot, dimensionId, plan.union.min);
      this.structures.discard(source);
      this.structures.discard(snapshot);
      this.log.warn(
        `build rotation for ${playerId} failed; restoration attempted`,
      );
      this.feedback.showMessage(playerId, "rotateFailed");
      return "refused";
    }
    discardAll(
      this.structures,
      session.recordSnapshot({
        dimensionId,
        box: plan.union,
        handle: snapshot,
      }),
    );
    this.structures.discard(source);
    session.replaceSelection(plan.target);
    unstuck(this.world, this.players, playerId, dimensionId, plan.target);
    this.feedback.showMessage(playerId, "rotateDone", volume(selectedBox));
    return "rotated";
  }
}
