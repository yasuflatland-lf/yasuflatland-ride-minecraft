import { cellsOf } from "../../domain/build/box";
import {
  anchorCell,
  type Face,
  pasteBox,
} from "../../domain/build/clipboard/clipboard";
import { planPaste } from "../../domain/build/edit/plan";
import { cancel } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
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
  }): void {
    const { playerId } = cmd;
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "pasteAim") return;
    const anchor = anchorCell(cmd.block, cmd.face);
    const clipboard = session.clipboard;
    if (!clipboard) {
      this.feedback.showMessage(playerId, "noClipboard");
      return;
    }
    const box = pasteBox(clipboard, anchor);
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
    session.setFlow(cancel(flow));
  }
}
