import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { PasteAt } from "./pasteAt";
import type { AimResult } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";
import { ResolvePasteTarget } from "./resolvePasteTarget";

export class PressPasteAim {
  private readonly resolveTarget: ResolvePasteTarget;

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly paste: PasteAt,
    private readonly feedback: BuildFeedback,
  ) {
    this.resolveTarget = new ResolvePasteTarget(repo);
  }

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    aim: AimResult;
    tick: number;
  }): "pasted" | "refused" | "menu" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "pasteAim") return "ignored";
    if (!session.clipboard) {
      this.feedback.showMessage(cmd.playerId, "noClipboard");
      return "ignored";
    }
    // ADR 0203: use the live gaze target shared with the outline at press time.
    const target = this.resolveTarget.execute(cmd);
    if (!target) return "menu";
    return this.paste.execute({
      playerId: cmd.playerId,
      dimensionId: cmd.dimensionId,
      target,
      tick: cmd.tick,
    });
  }
}
