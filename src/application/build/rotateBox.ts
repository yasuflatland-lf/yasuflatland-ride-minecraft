import { volume } from "../../domain/build/box";
import { planRotationAboutCenter } from "../../domain/build/rotation/rotateBox";
import { inDimension } from "../../domain/build/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Logger } from "../shared/ports/logger";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { BuildPlayers } from "./ports/players";
import type { BuildStructureStore, CaptureRefusal } from "./ports/structures";
import { SnapshotEdit } from "./snapshotEdit";
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
    if (flow.kind !== "selected") return "ignored";
    const { selection } = flow;
    if (!inDimension(selection, dimensionId)) return "ignored";
    const selectedBox = selection.box;
    const plan = planRotationAboutCenter(selectedBox);
    const count = volume(plan.union);
    if (count > BUILD_SPEC.maxCopyVolume) {
      this.feedback.showMessage(playerId, "rotateTooLarge", count);
      return "refused";
    }
    const edit = new SnapshotEdit(session, this.structures, this.feedback, cmd);
    const refusal = edit.preflight(
      plan.union,
      {
        allows: (cell) => this.world.mayEdit(dimensionId, cell),
        busy: "beforeProtection",
      },
      () => this.feedback.showMessage(playerId, "rotateBlocked"),
    );
    if (refusal) return refusal === "busy" ? "busy" : "refused";
    const reportCaptureRefusal = (reason: CaptureRefusal) => {
      if (reason === "tooLarge")
        this.feedback.showMessage(playerId, "rotateTooLarge", count);
      else this.feedback.showMessage(playerId, "copyUnreadable");
    };
    const snapshot = edit.captureExact(plan.union, reportCaptureRefusal);
    if (snapshot === undefined) return "refused";
    const source = edit.captureExact(selectedBox, (reason) => {
      this.structures.discard(snapshot);
      reportCaptureRefusal(reason);
    });
    if (source === undefined) return "refused";
    if (
      !edit.clear(selectedBox) ||
      !this.structures.place(source, dimensionId, plan.target.min, 1)
    ) {
      edit.rollback(plan.union, snapshot, { discardWithSnapshot: source });
      this.log.warn(
        `build rotation for ${playerId} failed; restoration attempted`,
      );
      this.feedback.showMessage(playerId, "rotateFailed");
      return "refused";
    }
    this.repo.update(session, () => {
      edit.commit({
        box: plan.union,
        selectionBefore: selectedBox,
        selectionBeforeTaps: flow.taps,
        handle: snapshot,
      });
    });
    this.structures.discard(source);
    session.retainRotatedSelection(
      plan.target,
      this.world.heightRange(dimensionId),
    );
    unstuck(this.world, this.players, playerId, dimensionId, plan.target);
    this.feedback.showMessage(playerId, "rotateDone", volume(selectedBox));
    return "rotated";
  }
}
