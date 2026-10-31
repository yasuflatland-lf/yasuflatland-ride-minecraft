import { virtualEndPoint } from "../../domain/build/aim/aim";
import { aimedRoofHeight } from "../../domain/build/aim/roofHeight";
import {
  anchorCell,
  type Face,
  pasteBox,
} from "../../domain/build/clipboard/clipboard";
import {
  type PreviewAim,
  previewPoints,
} from "../../domain/build/preview/preview";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";

function isFace(face: string): face is Face {
  return ["up", "down", "north", "south", "east", "west"].includes(face);
}

export class ShowPreview {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
  ) {}

  execute(tick: number): void {
    if (tick % BUILD_SPEC.outlineInterval !== 0) return;
    const blink = Math.floor(tick / BUILD_SPEC.outlineInterval) % 2 === 0;
    for (const id of this.repo.ids()) {
      const session = this.repo.get(id);
      if (!session?.isInBuildMode) continue;
      const { flow } = session;
      const aim = this.aimReader.aim(id);
      const preview: PreviewAim = { blink };
      if (flow.kind === "point1" && aim)
        preview.end = aim.block?.cell ?? virtualEndPoint(flow.cell, aim.ray);
      if (flow.kind === "roofHeight" && aim)
        preview.roofHeight = aimedRoofHeight(flow, aim.ray);
      if (flow.kind === "pasteAim" && aim?.block && session.clipboard) {
        const face = aim.block.face.toLowerCase();
        if (isFace(face))
          preview.pasteBox = pasteBox(
            session.clipboard,
            anchorCell(aim.block.cell, face),
          );
      }
      const set = previewPoints(flow, preview);
      if (Object.values(set).some((points) => points.length > 0))
        this.feedback.drawPreview(
          id,
          "dimensionId" in flow ? flow.dimensionId : undefined,
          set,
        );
    }
  }
}
