import { aimedEndPoint } from "../../domain/build/aim/endPoint";
import { aimedHeight } from "../../domain/build/aim/height";
import { sizeOf } from "../../domain/build/box";
import { liveHeightBox } from "../../domain/build/flow/heightFlow";
import type { BuildFlow } from "../../domain/build/flow/state";
import {
  type PreviewAim,
  previewModel,
} from "../../domain/build/preview/preview";
import { degreesOf } from "../../domain/build/rotation/quarterTurn";
import type { BuildSession } from "../../domain/build/session";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import { volumeSize } from "../../domain/build/volume/size";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { AimReader, AimResult } from "./ports/aim";
import type { BuildBlockWorld } from "./ports/blocks";
import type { BuildFeedback } from "./ports/feedback";
import type { ResolvePasteTarget } from "./resolvePasteTarget";
import type { SyncTapTarget } from "./syncTapTarget";
import { TrackGaze } from "./trackGaze";

type PreviewSample = {
  aim: AimResult | undefined;
  playerDimension: DimensionId | undefined;
};

type RefreshOptions = {
  showPasteHud?: boolean;
};

export class ShowPreview {
  private readonly trackGaze: TrackGaze;
  private readonly sizes = new Map<PlayerId, ReturnType<typeof volumeSize>>();
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly feedback: BuildFeedback,
    private readonly aimReader: AimReader,
    private readonly resolveTarget: ResolvePasteTarget,
    private readonly syncTapTarget: SyncTapTarget,
    private readonly blocks: Pick<BuildBlockWorld, "heightRange">,
  ) {
    this.trackGaze = new TrackGaze(blocks);
  }

  execute(tick: number): void {
    this.pruneCaches();
    for (const id of this.repo.ids()) {
      const session = this.repo.get(id);
      const kind = session?.flow.kind;
      const interval =
        session?.isInBuildMode &&
        (kind === "baseHeight" ||
          (session.flow.kind === "heightStep" && !session.flow.heightLocked))
          ? BUILD_SPEC.liveOutlineInterval
          : BUILD_SPEC.outlineInterval;
      const redraw = tick % interval === 0;
      if (!session?.isInBuildMode) {
        if (redraw) this.hideTapTarget(id);
        continue;
      }
      if (!redraw && kind !== "baseHeight") continue;
      const sample = this.sample(session);
      if (sample.aim) this.trackGaze.execute(session, sample.aim);
      if (redraw) this.render(session, tick, sample);
    }
  }

  refresh(id: PlayerId, tick: number): void {
    this.refreshPlayer(id, tick, this.repo.get(id));
  }

  refreshAfterPastePress(id: PlayerId, tick: number): void {
    const session = this.repo.get(id);
    this.refreshPlayer(id, tick, session, {
      showPasteHud: false,
    });
  }

  private refreshPlayer(
    id: PlayerId,
    tick: number,
    session: BuildSession | undefined,
    options?: RefreshOptions,
  ): void {
    if (!session?.isInBuildMode) {
      this.hideTapTarget(id);
      return;
    }
    this.render(session, tick, this.sample(session), options);
  }

  private sample(session: BuildSession): PreviewSample {
    if (session.flow.kind === "pasteAim")
      return {
        aim: undefined,
        playerDimension: this.aimReader.dimensionOf(session.playerId),
      };
    if (
      session.flow.kind === "stairAim" ||
      session.flow.kind === "stairContents"
    )
      return { aim: undefined, playerDimension: undefined };
    const aim = this.aimReader.aim(session.playerId);
    const playerDimension =
      aim?.input === "touch"
        ? this.aimReader.dimensionOf(session.playerId)
        : undefined;
    return { aim, playerDimension };
  }

  private render(
    session: BuildSession,
    tick: number,
    { aim, playerDimension }: PreviewSample,
    { showPasteHud = true }: RefreshOptions = {},
  ): void {
    const { playerId, flow } = session;
    const blink = Math.floor(tick / BUILD_SPEC.outlineInterval) % 2 === 0;
    const preview = this.previewAim(flow, aim, blink);
    preview.playerDimension = playerDimension;
    if (flow.kind === "pasteAim" && flow.tap && playerDimension) {
      const result = this.resolveTarget.execute({
        playerId,
        dimensionId: playerDimension,
        tap: flow.tap,
        tick,
      });
      if (result.kind === "target") preview.pasteTarget = result.target;
    }

    const { dimensionId, set } = previewModel(flow, preview);
    this.syncTapTarget.execute({
      playerId,
      inBuildMode: true,
      flow,
      aim,
      dimensionId: dimensionId === playerDimension ? dimensionId : undefined,
    });
    this.reportHud(session, preview, showPasteHud);
    if (Object.values(set).some((points) => points.length > 0))
      this.feedback.drawPreview(playerId, dimensionId, set);
  }

  private previewAim(
    flow: BuildFlow,
    aim: AimResult | undefined,
    blink: boolean,
  ): PreviewAim {
    const preview: PreviewAim = { blink };
    if (flow.kind === "point1" && aim)
      preview.end = aimedEndPoint(
        flow.start.cell,
        aim,
        this.blocks.heightRange(flow.start.dimensionId),
      );
    if (flow.kind === "heightStep")
      preview.height =
        !flow.heightLocked && aim
          ? aimedHeight(
              flow,
              aim.ray,
              this.blocks.heightRange(flow.start.dimensionId),
            )
          : flow.liveHeight;
    return preview;
  }

  private reportHud(
    { playerId, flow, clipboard, pasteTurn }: BuildSession,
    preview: PreviewAim,
    showPasteHud: boolean,
  ): void {
    if (flow.kind === "heightStep")
      this.reportSize(
        playerId,
        volumeSize(flow.base, preview.height ?? flow.liveHeight),
        false,
      );
    if (flow.kind === "baseHeight")
      this.reportSize(playerId, sizeOf(liveHeightBox(flow)), true);
    if (flow.kind === "pasteAim" && clipboard && showPasteHud)
      this.feedback.showMode(playerId, {
        kind: "pasteReady",
        size: clipboard.size,
        blockCount: clipboard.blockCount,
        degrees: degreesOf(pasteTurn),
      });
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

  private hideTapTarget(playerId: PlayerId): void {
    this.syncTapTarget.execute({
      playerId,
      inBuildMode: false,
      flow: undefined,
      aim: undefined,
      dimensionId: undefined,
    });
  }

  private pruneCaches(): void {
    for (const id of this.sizes.keys()) {
      const session = this.repo.get(id);
      if (
        !session?.isInBuildMode ||
        (session.flow.kind !== "heightStep" &&
          session.flow.kind !== "baseHeight")
      )
        this.sizes.delete(id);
    }
  }
}
