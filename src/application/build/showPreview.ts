import { virtualEndPoint } from "../../domain/build/aim/aim";
import { aimedHeight } from "../../domain/build/aim/height";
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
import { volumeSize } from "../../domain/build/volume/size";
import type { PlayerId } from "../../domain/shared/ids";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";

function isFace(face: string): face is Face {
  return ["up", "down", "north", "south", "east", "west"].includes(face);
}

export class ShowPreview {
  private readonly sizes = new Map<PlayerId, ReturnType<typeof volumeSize>>();
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
  ) {}

  execute(tick: number): void {
    for (const id of this.sizes.keys()) {
      const session = this.repo.get(id);
      if (!session?.isInBuildMode || session.flow.kind !== "heightStep")
        this.sizes.delete(id);
    }
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
      if (flow.kind === "heightStep") {
        preview.height =
          !flow.heightLocked && aim
            ? aimedHeight(flow, aim.ray)
            : flow.previous;
        const size = volumeSize(flow.base, preview.height);
        const previous = this.sizes.get(id);
        if (
          previous?.x !== size.x ||
          previous.y !== size.y ||
          previous.z !== size.z
        ) {
          this.feedback.showSize(id, size);
          this.sizes.set(id, size);
        }
      }
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
