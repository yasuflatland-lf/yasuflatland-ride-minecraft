// Use case: draw the selection and paste outlines to players in build mode (ADR 0178).
import { pasteBox } from "../../domain/build/clipboard/clipboard";
import { selectionBox } from "../../domain/build/selection/selection";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { BuildFeedback } from "./ports/feedback";
import type { RiderGate } from "./ports/rider";

export class ShowOutline {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly gate: RiderGate,
    private readonly feedback: BuildFeedback,
  ) {}

  execute(tick: number): void {
    if (tick % BUILD_SPEC.outlineInterval !== 0) return;
    for (const id of this.repo.ids()) {
      const session = this.repo.get(id);
      if (!session?.isInBuildMode) continue;
      const { selection } = session;
      const box = selectionBox(selection);
      if (selection && box) {
        this.feedback.drawOutline(id, selection.dimensionId, box, "selection");
      }
      const feet = this.gate.bulldozerFeet(id);
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
