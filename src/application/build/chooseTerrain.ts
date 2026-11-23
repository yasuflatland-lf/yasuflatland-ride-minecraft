import { cellBox, volume } from "../../domain/build/box";
import { isFillMaterial } from "../../domain/build/edit/guard";
import { chooseTerrain } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import {
  fitsTerrainLimit,
  removeAboveBox,
  type TerrainOp,
  terrainAreaOf,
} from "../../domain/build/terrain/area";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseTerrain {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
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
    const area = terrainAreaOf(flow.selection.box, flow.from, flow.to);
    if (!fitsTerrainLimit(area)) {
      const box =
        op === "fillBelow"
          ? cellBox(
              { x: area.minX, y: BUILD_SPEC.worldBottomY, z: area.minZ },
              { x: area.maxX, y: area.higherY, z: area.maxZ },
            )
          : removeAboveBox(area);
      this.feedback.showMessage(playerId, "tooLarge", box ? volume(box) : 0);
      return;
    }
    session.setFlow(chooseTerrain(flow, op));
  }
}
