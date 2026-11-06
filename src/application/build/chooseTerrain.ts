import { volume } from "../../domain/build/box";
import { chooseTerrain } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
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
    if (flow.kind !== "endpoint") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const area = terrainAreaOf(flow.from, flow.to);
    if (!fitsTerrainLimit(area)) {
      const box = removeAboveBox(area);
      this.feedback.showMessage(playerId, "tooLarge", box ? volume(box) : 0);
      return;
    }
    session.setFlow(chooseTerrain(flow, op));
  }
}
