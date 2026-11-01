// Use case: copy the selection into the clipboard in one tick (ADR 0178).

import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import { CopyBox } from "./copyBox";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class CopySelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const confirmed = session.confirmedBox;
    if (!confirmed) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const { box, dimensionId } = confirmed;
    new CopyBox(this.repo, this.world, this.feedback).execute(
      playerId,
      dimensionId,
      box,
    );
  }
}
