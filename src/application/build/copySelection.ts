// Use case: copy the selection into the clipboard in one tick (ADR 0178).

import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { CopyBox } from "./copyBox";
import type { FacingReader } from "./ports/facing";
import type { BuildFeedback } from "./ports/feedback";

export class CopySelection {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly copy: CopyBox,
    private readonly feedback: BuildFeedback,
    private readonly facing: FacingReader,
  ) {}

  execute(cmd: { playerId: PlayerId }): void {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const confirmed = session.confirmedBox;
    if (!confirmed) {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    this.copy.execute({
      playerId,
      selection: confirmed,
      facing: this.facing.facingOf(playerId),
    });
  }
}
