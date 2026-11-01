import { cellsOf } from "../../domain/build/box";
import type { PasteTarget } from "../../domain/build/clipboard/clipboard";
import { planPaste } from "../../domain/build/edit/plan";
import { isRepeat, recordPaste } from "../../domain/build/flow/paste";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { EditJobs } from "./editJobs";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";

export class PasteAt {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly world: BuildBlockWorld,
    private readonly feedback: BuildFeedback,
    private readonly jobs: EditJobs,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
    target: PasteTarget;
    tick: number;
  }): "pasted" | "refused" | "ignored" {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "pasteAim") return "ignored";
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return "refused";
    }
    const { anchor, box } = cmd.target;
    if (isRepeat(flow, anchor, cmd.tick, BUILD_SPEC.pasteRepeatTicks))
      return "ignored";
    for (const cell of cellsOf(box)) {
      if (!this.world.mayEdit(cmd.dimensionId, cell)) {
        this.feedback.showMessage(playerId, "pasteBlocked");
        return "refused";
      }
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return "refused";
    }
    this.jobs.start(
      playerId,
      cmd.dimensionId,
      planPaste(clipboard, anchor, flow.skipAir),
      false,
    );
    session.setFlow(recordPaste(flow, anchor, cmd.tick));
    return "pasted";
  }
}
