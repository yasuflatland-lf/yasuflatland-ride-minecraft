import { AIR } from "../../domain/build/blockState";
import { boxOf } from "../../domain/build/box";
import { planFillBelow, planShape } from "../../domain/build/edit/plan";
import { backToAiming } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import { BUILD_SPEC } from "../../domain/build/spec";
import { removeAboveBox, terrainAreaOf } from "../../domain/build/terrain/area";
import type { PlayerId } from "../../domain/shared/ids";
import { isOpenBlock } from "../../domain/shared/keptBlocks";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmTerrain {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
    private readonly world: BuildBlockWorld,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "terrainConfirm") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    if (session.isEditing) {
      // The form has closed and taps do nothing in terrainConfirm, so do not stay there.
      session.setFlow(backToAiming(flow));
      this.feedback.showMessage(playerId, "busy");
      return;
    }
    const selection = boxOf(flow.from, flow.to);
    const area = terrainAreaOf(flow.from, flow.to);
    const box = removeAboveBox(area);
    if (flow.op === "removeAbove" && !box) {
      session.confirmBox(flow.dimensionId, selection);
      this.feedback.showMessage(playerId, "editDoneCount", 0);
      return;
    }
    // beginCheckedEdit applies maxVolume, which terrain operations replace with a side limit (ADR 0233).
    session.beginEdit();
    session.confirmBox(flow.dimensionId, selection);
    this.feedback.showMessage(
      playerId,
      flow.op === "fillBelow" ? "building" : "removing",
      undefined,
      flow.material,
    );
    this.jobs.start(
      playerId,
      flow.dimensionId,
      flow.op === "fillBelow"
        ? planFillBelow(
            area,
            flow.material,
            (cell) => {
              const state = this.world.stateAt(flow.dimensionId, cell);
              return (
                state !== undefined &&
                isOpenBlock(state.typeId) &&
                this.world.mayEdit(flow.dimensionId, cell)
              );
            },
            BUILD_SPEC.worldBottomY,
          )
        : box
          ? planShape(shapeOf(box.min, box.max), "fill", { state: AIR })
          : [],
      "irreversible",
    );
  }
}
