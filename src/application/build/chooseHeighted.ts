import { dimensionOf } from "../../domain/build/flow/state";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { HeightedKind } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
export class ChooseHeighted {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly world: Pick<BuildBlockWorld, "heightRange">,
  ) {}
  execute(cmd: { playerId: PlayerId; kind: HeightedKind }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    const dimensionId = dimensionOf(session.flow);
    if (!dimensionId) return;
    const result = session.chooseHeighted(
      cmd.kind,
      this.world.heightRange(dimensionId),
    );
    if ("refused" in result) {
      if (result.refused === "tooLarge")
        this.feedback.showMessage(cmd.playerId, result.refused);
      return;
    }
    this.feedback.showMessage(
      cmd.playerId,
      "building",
      undefined,
      result.material,
    );
  }
}
