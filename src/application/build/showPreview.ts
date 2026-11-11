import { virtualEndPoint } from "../../domain/build/aim/aim";
import { aimedHeight } from "../../domain/build/aim/height";
import {
  type PreviewAim,
  previewPoints,
} from "../../domain/build/preview/preview";
import { degreesOf } from "../../domain/build/rotation/quarterTurn";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import { volumeSize } from "../../domain/build/volume/size";
import type { PlayerId } from "../../domain/shared/ids";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";
import type { ResolvePasteTarget } from "./resolvePasteTarget";

export class ShowPreview {
  private readonly sizes = new Map<PlayerId, ReturnType<typeof volumeSize>>();
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
    private readonly resolveTarget: ResolvePasteTarget,
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
      if (flow.kind === "rotateMode")
        this.feedback.showMode(id, {
          kind: "rotate",
          degrees: degreesOf(flow.turn),
        });
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
      if (flow.kind === "pasteAim" && session.clipboard)
        this.feedback.showMode(id, {
          kind: "pasteReady",
          size: session.clipboard.size,
          blockCount: session.clipboard.blockCount,
        });
      const dimensionId =
        flow.kind === "pasteAim" ? this.aimReader.dimensionOf(id) : undefined;
      if (flow.kind === "pasteAim" && aim && session.clipboard && dimensionId) {
        const result = this.resolveTarget.execute({
          playerId: id,
          dimensionId,
          aim,
          tick,
        });
        if (result.kind === "target") preview.pasteBox = result.target.box;
      }
      const set = previewPoints(flow, preview);
      if (Object.values(set).some((points) => points.length > 0))
        this.feedback.drawPreview(
          id,
          "dimensionId" in flow ? flow.dimensionId : dimensionId,
          set,
        );
    }
  }
}
