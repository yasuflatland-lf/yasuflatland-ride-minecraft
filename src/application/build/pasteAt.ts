import { cellsOf } from "../../domain/build/box";
import { type Face, pasteTarget } from "../../domain/build/clipboard/clipboard";
import { planPaste } from "../../domain/build/edit/plan";
import { isRepeat, recordPaste } from "../../domain/build/flow/paste";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { Cell } from "../../domain/shared/cells";
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
    block: Cell;
    face: Face;
    tick: number;
  }): void {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "pasteAim") return;
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return;
    }
    const { anchor, box } = pasteTarget(clipboard, cmd.block, cmd.face);
    if (isRepeat(flow, anchor, cmd.tick, BUILD_SPEC.pasteRepeatTicks)) return;
    for (const cell of cellsOf(box)) {
      if (!this.world.mayEdit(cmd.dimensionId, cell)) {
        this.feedback.showMessage(playerId, "pasteBlocked");
        return;
      }
    }
    const busy = session.beginEdit();
    if (busy) {
      this.feedback.showMessage(playerId, busy);
      return;
    }
    this.jobs.start(
      playerId,
      cmd.dimensionId,
      planPaste(clipboard, anchor, flow.skipAir),
      false,
    );
    session.setFlow(recordPaste(flow, anchor, cmd.tick));
  }
}
