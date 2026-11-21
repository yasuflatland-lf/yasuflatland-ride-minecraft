import { volume } from "../../domain/build/box";
import { enteredBaseHeight, tapAir } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { Cell } from "../../domain/shared/cells";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildFeedback } from "./ports/feedback";

export class TapAir {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}
  execute(cmd: { playerId: PlayerId; end?: Cell }): void {
    const session = this.repo.get(cmd.playerId);
    if (!session) return;
    const flow = session.flow;
    const next = tapAir(flow, cmd.end);
    if (next === flow) return;
    session.setFlow(next);
    if (enteredBaseHeight(flow, next))
      this.feedback.showMessage(cmd.playerId, "heightAim");
    else if (next.kind === "selected")
      this.feedback.showMessage(
        cmd.playerId,
        "endSet",
        volume(next.selection.box),
      );
  }
}
