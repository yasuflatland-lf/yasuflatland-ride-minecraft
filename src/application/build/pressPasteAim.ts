import { aimedPasteTarget } from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { PasteAt } from "./pasteAt";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";

export class PressPasteAim {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly paste: PasteAt,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    aim: ReturnType<AimReader["aim"]>;
    tick: number;
    sneaking: boolean;
  }): "pasted" | "refused" | "menu" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "pasteAim") return "ignored";
    if (!session.clipboard) {
      this.feedback.showMessage(cmd.playerId, "noClipboard");
      return "ignored";
    }
    if (!cmd.sneaking) return "menu";
    // ADR 0203: use the live gaze target shared with the outline at press time.
    const target =
      cmd.aim &&
      aimedPasteTarget(session.clipboard, cmd.aim, session.pasteTurn);
    if (!target) {
      this.feedback.showMessage(cmd.playerId, "pasteNoTarget");
      return "ignored";
    }
    return this.paste.execute({
      playerId: cmd.playerId,
      dimensionId: cmd.dimensionId,
      target,
      tick: cmd.tick,
    });
  }
}
