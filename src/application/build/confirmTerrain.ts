import { AIR } from "../../domain/build/blockState";
import { boxOf } from "../../domain/build/box";
import { planShape } from "../../domain/build/edit/plan";
import { backToAiming } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import { removeAboveBox, terrainAreaOf } from "../../domain/build/terrain/area";
import type { PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildFeedback } from "./ports/feedback";

export class ConfirmTerrain {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "terrainConfirm") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const selection = boxOf(flow.from, flow.to);
    const box = removeAboveBox(terrainAreaOf(flow.from, flow.to));
    if (!box) {
      session.confirmBox(flow.dimensionId, selection);
      this.feedback.showMessage(playerId, "editDoneCount", 0);
      return;
    }
    // beginCheckedEdit applies maxVolume, which terrain operations replace with a side limit (ADR 0233).
    const refusal = session.beginEdit();
    if (refusal) {
      // The form has closed and taps do nothing in terrainConfirm, so do not stay there.
      session.setFlow(backToAiming(flow));
      this.feedback.showMessage(playerId, refusal);
      return;
    }
    session.confirmBox(flow.dimensionId, selection);
    this.feedback.showMessage(playerId, "removing");
    this.jobs.start(
      playerId,
      flow.dimensionId,
      planShape(shapeOf(box.min, box.max), "fill", { state: AIR }),
      "irreversible",
    );
  }
}
