import { aimedEndPoint } from "../../domain/build/aim/endPoint";
import { aimedHeight } from "../../domain/build/aim/height";
import { sizeOf } from "../../domain/build/box";
import { type BuildFlow, liveHeightBox } from "../../domain/build/flow/flow";
import {
  type PreviewAim,
  previewPoints,
} from "../../domain/build/preview/preview";
import { degreesOf } from "../../domain/build/rotation/quarterTurn";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import {
  type Staircase,
  staircaseToward,
} from "../../domain/build/stairs/staircase";
import { volumeSize } from "../../domain/build/volume/size";
import type { PlayerId } from "../../domain/shared/ids";
import { AimHeight } from "./aimHeight";
import type { AimReader } from "./ports/aim";
import type { BuildFeedback } from "./ports/feedback";
import type { ResolvePasteTarget } from "./resolvePasteTarget";
import type { SyncTapTarget } from "./syncTapTarget";

export class ShowPreview {
  private readonly aimHeight: AimHeight;
  private readonly sizes = new Map<PlayerId, ReturnType<typeof volumeSize>>();
  private readonly staircases = new Map<
    PlayerId,
    {
      flow: Extract<BuildFlow, { kind: "stairAim" }>;
      staircase: Staircase;
    }
  >();
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
    private readonly resolveTarget: ResolvePasteTarget,
    private readonly syncTapTarget: SyncTapTarget,
  ) {
    this.aimHeight = new AimHeight(repo);
  }

  execute(tick: number): void {
    for (const id of this.sizes.keys()) {
      const session = this.repo.get(id);
      if (
        !session?.isInBuildMode ||
        (session.flow.kind !== "heightStep" &&
          session.flow.kind !== "baseHeight")
      )
        this.sizes.delete(id);
    }
    for (const id of this.staircases.keys()) {
      const session = this.repo.get(id);
      if (!session?.isInBuildMode || session.flow.kind !== "stairAim")
        this.staircases.delete(id);
    }
    for (const id of this.repo.ids()) {
      const interval = this.followsGaze(id)
        ? BUILD_SPEC.liveOutlineInterval
        : BUILD_SPEC.outlineInterval;
      if (tick % interval === 0) this.refresh(id, tick);
    }
  }

  private reportSize(
    id: PlayerId,
    size: ReturnType<typeof volumeSize>,
    aiming: boolean,
  ): void {
    const previous = this.sizes.get(id);
    if (
      previous?.x === size.x &&
      previous.y === size.y &&
      previous.z === size.z
    )
      return;
    this.feedback.showSize(id, size, aiming);
    this.sizes.set(id, size);
  }

  private followsGaze(id: PlayerId): boolean {
    const session = this.repo.get(id);
    if (!session?.isInBuildMode) return false;
    const { flow } = session;
    return (
      flow.kind === "baseHeight" ||
      (flow.kind === "heightStep" && !flow.heightLocked)
    );
  }

  refresh(id: PlayerId, tick: number, reason?: "resumePaste"): void {
    const blink = Math.floor(tick / BUILD_SPEC.outlineInterval) % 2 === 0;
    const session = this.repo.get(id);
    if (!session?.isInBuildMode || session.flow.kind !== "stairAim")
      this.staircases.delete(id);
    if (!session?.isInBuildMode) {
      this.syncTapTarget.execute({
        playerId: id,
        inBuildMode: false,
        flow: session?.flow,
        aim: undefined,
        dimensionId: undefined,
      });
      return;
    }
    const aim = this.aimReader.aim(id);
    if (session.flow.kind === "baseHeight" && aim)
      this.aimHeight.execute({ playerId: id, ray: aim.ray });
    const { flow } = session;
    const preview: PreviewAim = { blink };
    if (flow.kind === "point1" && aim)
      preview.end = aimedEndPoint(flow.cell, aim);
    if (flow.kind === "heightStep") {
      preview.height =
        !flow.heightLocked && aim ? aimedHeight(flow, aim.ray) : flow.previous;
      this.reportSize(id, volumeSize(flow.base, preview.height), false);
    }
    if (flow.kind === "baseHeight")
      this.reportSize(id, sizeOf(liveHeightBox(flow)), true);
    if (flow.kind === "stairAim") {
      const hit = aim?.block?.cell;
      const staircase = hit && staircaseToward(flow.row, hit);
      if (staircase) this.staircases.set(id, { flow, staircase });
      const cached = this.staircases.get(id);
      if (cached?.flow === flow) preview.staircase = cached.staircase;
      else this.staircases.delete(id);
    }
    const playerDimension =
      flow.kind === "pasteAim" || aim?.input === "touch"
        ? this.aimReader.dimensionOf(id)
        : undefined;
    const markerDimension =
      "selection" in flow
        ? flow.selection.dimensionId
        : "dimensionId" in flow
          ? flow.dimensionId
          : playerDimension;
    this.syncTapTarget.execute({
      playerId: id,
      inBuildMode: true,
      flow,
      aim,
      dimensionId:
        markerDimension === playerDimension ? markerDimension : undefined,
    });
    if (
      flow.kind === "pasteAim" &&
      aim &&
      session.clipboard &&
      playerDimension
    ) {
      const result = this.resolveTarget.execute({
        playerId: id,
        dimensionId: playerDimension,
        facing: reason === "resumePaste" ? session.clipboard.facing : undefined,
        aim,
        tick,
      });
      if (result.kind === "target") preview.pasteBox = result.target.box;
    }
    if (
      flow.kind === "pasteAim" &&
      session.clipboard &&
      reason !== "resumePaste"
    )
      this.feedback.showMode(id, {
        kind: "pasteReady",
        size: session.clipboard.size,
        blockCount: session.clipboard.blockCount,
        degrees: degreesOf(session.pasteTurn),
      });
    const set = previewPoints(flow, preview);
    if (Object.values(set).some((points) => points.length > 0))
      this.feedback.drawPreview(id, markerDimension, set);
  }
}
