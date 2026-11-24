import { volume } from "../../domain/build/box";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import {
  fillBelowBox,
  removeAboveBox,
  type TerrainOp,
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
    const result = session.chooseTerrain(op);
    if (!result) return;
    if (result.refused !== "tooLarge") {
      this.feedback.showMessage(playerId, result.refused);
      return;
    }
    const range = this.world.heightRange(result.dimensionId);
    const box =
      op === "fillBelow"
        ? fillBelowBox(result.area, range)
        : removeAboveBox(result.area, range);
    this.feedback.showMessage(playerId, result.refused, box ? volume(box) : 0);
  }
}
