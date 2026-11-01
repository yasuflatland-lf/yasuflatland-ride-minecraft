import { chooseHeighted, copyBoxOf } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { shapeOf } from "../../domain/build/shape/shape";
import type { PlayerId } from "../../domain/shared/ids";
import type { CopyBox } from "./copyBox";
import type { BuildFeedback } from "./ports/feedback";

export class ChooseCopy {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly copy: CopyBox,
    private readonly feedback: BuildFeedback,
  ) {}

  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.getOrCreate(playerId);
    const flow = session.flow;
    if (flow.kind !== "endpoint") {
      this.feedback.showMessage(playerId, "noSelection");
      return;
    }
    const shape = shapeOf(flow.from, flow.to);
    if (shape.kind === "rect" && shape.flat === "y") {
      session.setFlow(chooseHeighted(flow, "copy"));
      return;
    }
    const box = copyBoxOf(flow);
    if (box) this.copy.execute(playerId, flow.dimensionId, box);
  }
}
