import { boxOf } from "../../domain/build/box";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { BuildFeedback } from "./ports/feedback";

export class ShowOutline {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(tick: number): void {
    if (tick % BUILD_SPEC.outlineInterval !== 0) return;
    for (const id of this.repo.ids()) {
      const session = this.repo.get(id);
      if (!session?.isInBuildMode) continue;
      const { flow } = session;
      if (flow.kind === "point1")
        this.feedback.drawCorner(id, flow.dimensionId, flow.cell);
      if (flow.kind === "endpoint")
        this.feedback.drawOutline(
          id,
          flow.dimensionId,
          boxOf(flow.from, flow.to),
          "selection",
        );
    }
  }
}
