import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { PasteAt } from "./pasteAt";
import type { AimResult } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";
import type { ResolvePasteTarget } from "./resolvePasteTarget";

export class PressPasteAim {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly paste: PasteAt,
    private readonly feedback: BuildFeedback,
    private readonly resolveTarget: ResolvePasteTarget,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    aim: AimResult | undefined;
    tick: number;
    sneaking: boolean;
    intent?: "wand" | "place";
  }): "aiming" | "pasted" | "refused" | "menu" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    const placing = cmd.intent === "place";
    if (session?.flow.kind !== "pasteAim") {
      if (placing && session?.resumePasteAim()) {
        this.feedback.showMessage(cmd.playerId, "pasteChoosePosition");
        return "aiming";
      }
      if (placing) this.feedback.showMessage(cmd.playerId, "pasteInactive");
      return "ignored";
    }
    if (!session.clipboard) {
      this.feedback.showMessage(
        cmd.playerId,
        placing ? "pasteInactive" : "noClipboard",
      );
      return "ignored";
    }
    if (!placing && !cmd.sneaking) return "menu";
    // ADR 0203: use the live gaze target shared with the outline at press time.
    // A press re-probes so it never places on a snap cached by the outline.
    const result = cmd.aim
      ? this.resolveTarget.execute({ ...cmd, aim: cmd.aim, fresh: true })
      : { kind: "noTarget" as const };
    if (result.kind === "noTarget") {
      this.feedback.showMessage(cmd.playerId, "pasteNoTarget");
      return "ignored";
    }
    if (result.kind === "noGround") {
      this.feedback.showMessage(cmd.playerId, "noGround");
      return "refused";
    }
    return this.paste.execute({
      playerId: cmd.playerId,
      dimensionId: cmd.dimensionId,
      target: result.target,
    });
  }
}
