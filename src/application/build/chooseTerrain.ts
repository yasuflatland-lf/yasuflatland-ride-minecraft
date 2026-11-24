import { volume } from "../../domain/build/box";
import { isFillMaterial } from "../../domain/build/edit/guard";
import { chooseTerrain } from "../../domain/build/flow/terrainFlow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  fillBelowBox,
  fitsTerrainLimit,
  removeAboveBox,
  type TerrainOp,
  terrainAreaOf,
} from "../../domain/build/terrain/area";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseTerrain {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly world: Pick<BuildBlockWorld, "heightRange">,
  ) {}

  execute({ playerId, op }: { playerId: PlayerId; op: TerrainOp }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "selected") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    if (op === "fillBelow" && !isFillMaterial(flow.selection.material)) {
      this.feedback.showMessage(playerId, "fillMaterialRefused");
      return;
    }
    const area = terrainAreaOf(
      flow.selection.box,
      flow.taps.from,
      flow.taps.to,
    );
    if (!fitsTerrainLimit(area)) {
      const range = this.world.heightRange(flow.selection.dimensionId);
      const box =
        op === "fillBelow"
          ? fillBelowBox(area, range)
          : removeAboveBox(area, range);
      this.feedback.showMessage(playerId, "tooLarge", box ? volume(box) : 0);
      return;
    }
    session.setFlow(chooseTerrain(flow, op));
  }
}
