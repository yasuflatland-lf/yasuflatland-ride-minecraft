// Use case: draw the selection outline, a lone selection corner, and the paste
// outline to players in build mode (ADR 0178, ADR 0183).

import { boxOf } from "../../domain/build/box";
import { pasteBox } from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { BuildAnchor } from "./ports/anchor";
import type { BuildFeedback } from "./ports/feedback";

export class ShowOutline {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly anchor: BuildAnchor,
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
      const feet = this.anchor.feetOf(id);
      if (session.clipboard && feet) {
        this.feedback.drawOutline(
          id,
          feet.dimensionId,
          pasteBox(session.clipboard, feet.cell),
          "paste",
        );
      }
    }
  }
}
