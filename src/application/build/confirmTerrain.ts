import { AIR } from "../../domain/build/blockState";
import { uniformPattern } from "../../domain/build/edit/pattern";
import { planFillBelow, planShape } from "../../domain/build/edit/plan";
import { backToAiming } from "../../domain/build/flow/stepBack";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import { removeAboveBox, terrainAreaOf } from "../../domain/build/terrain/area";
import { isFillable } from "../../domain/build/terrain/fillable";
import type { PlayerId } from "../../domain/shared/ids";
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
    const { selection, taps } = flow;
    const { dimensionId, material } = selection;
    const area = terrainAreaOf(selection.box, taps.from, taps.to);
    const range = this.world.heightRange(dimensionId);
    const box = removeAboveBox(area, range);
    if (flow.op === "removeAbove" && !box) {
      session.confirmBox(selection, "selected", taps);
      this.feedback.showMessage(playerId, "editDoneCount", 0);
      return;
    }
    // beginCheckedEdit applies maxVolume, which terrain operations replace with a side limit (ADR 0233).
    session.beginEdit();
    session.confirmBox(selection, "selected", taps);
    this.feedback.showMessage(
      playerId,
      flow.op === "fillBelow" ? "building" : "removing",
      undefined,
      material,
    );
    this.jobs.start(
      playerId,
      dimensionId,
      flow.op === "fillBelow"
        ? planFillBelow(
            area,
            material,
            (cell) =>
              isFillable(this.world.stateAt(dimensionId, cell)?.typeId, () =>
                this.world.mayEdit(dimensionId, cell),
              ),
            range.minY,
          )
        : box
          ? planShape(shapeOf(box.min, box.max), "fill", uniformPattern(AIR))
          : [],
      "irreversible",
    );
  }
}
