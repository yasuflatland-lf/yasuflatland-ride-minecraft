import { tapAir } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeCount, shapeOf } from "../../domain/build/shape/shape";
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
    const next = tapAir(session.flow, cmd.end);
    if (next === session.flow) return;
    session.setFlow(next);
    if (next.kind === "endpoint")
      this.feedback.showMessage(
        cmd.playerId,
        "endSet",
        shapeCount(shapeOf(next.from, next.to), "fill"),
      );
  }
}
