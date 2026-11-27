import type { BlockTap } from "../../domain/build/blockTap";
import { isDeliberate } from "../../domain/build/flow/tapConfirm";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { PasteAt } from "./pasteAt";
import type { FacingReader } from "./ports/facing";
import type { BuildFeedback } from "./ports/feedback";
import type { ResolvePasteTarget } from "./resolvePasteTarget";

type PastePress = { playerId: PlayerId; quietTicks: number; tick: number };

export class PressPasteAim {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly paste: PasteAt,
    private readonly feedback: BuildFeedback,
    private readonly resolveTarget: ResolvePasteTarget,
    private readonly facing: FacingReader,
  ) {}

  tap(cmd: PastePress & { tap: BlockTap }): "pasted" | "refused" | "ignored" {
    const { playerId, tap, quietTicks } = cmd;
    const session = this.repo.get(playerId);
    if (session?.flow.kind !== "pasteAim" || !session.clipboard)
      return "ignored";
    const facing = session.flow.facing ?? this.facing.facingOf(playerId);
    if (session.tapPaste(tap, quietTicks, facing) !== "confirm")
      return "ignored";
    return this.commit(
      { ...cmd, dimensionId: tap.dimensionId },
      session.flow.tap,
    );
  }

  execute(
    cmd: PastePress & {
      dimensionId: DimensionId;
      sneaking: boolean;
      intent?: "wand" | "place";
    },
  ): "aiming" | "pasted" | "refused" | "menu" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    const placing = cmd.intent === "place";
    if (session?.flow.kind !== "pasteAim") {
      if (placing && session?.resumePasteAim()) {
        this.feedback.showMessage(cmd.playerId, "pasteTapPosition");
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
    if (!isDeliberate(cmd.quietTicks)) return "ignored";
    return this.commit(cmd, session.flow.tap);
  }

  private commit(
    cmd: PastePress & { dimensionId: DimensionId },
    tap: BlockTap | undefined,
  ): "pasted" | "refused" | "ignored" {
    const { playerId, dimensionId, tick } = cmd;
    // Re-probe before committing in case the ground changed since the preview.
    const result = tap
      ? this.resolveTarget.execute({
          playerId,
          dimensionId,
          tick,
          tap,
          fresh: true,
        })
      : { kind: "noTarget" as const };
    if (result.kind === "noTarget") {
      this.feedback.showMessage(playerId, "pasteTapPosition");
      return "ignored";
    }
    if (result.kind === "noGround") {
      this.feedback.showMessage(playerId, "noGround");
      return "refused";
    }
    return this.paste.execute({ playerId, dimensionId, target: result.target });
  }
}
