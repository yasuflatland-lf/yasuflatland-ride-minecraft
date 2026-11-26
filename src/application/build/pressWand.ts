import type { Ray } from "../../domain/build/aim/aim";
import { virtualAimedEndPoint } from "../../domain/build/aim/endPoint";
import type { BlockTap } from "../../domain/build/blockTap";
import type { PressIntent } from "../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { FixStairGoal } from "./fixStairGoal";
import type { AimResult } from "./ports/aim";
import type { BuildBlockWorld } from "./ports/blocks";
import type { PressPasteAim } from "./pressPasteAim";
import type { SetPoint } from "./setPoint";
import type { TapAir } from "./tapAir";

export type FollowUp =
  | "utilityMenu"
  | "contentsMenu"
  | "stairContents"
  | "terraceMenu"
  | "pasteMenu"
  | "none";

export class PressWand {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly actions: {
      setPoint: SetPoint;
      tapAir: TapAir;
      fixStairGoal: FixStairGoal;
      pressPasteAim: PressPasteAim;
      onPasted(playerId: PlayerId, tick: number): void;
    },
    private readonly blocks: Pick<BuildBlockWorld, "heightRange">,
  ) {}

  execute({
    playerId,
    intent,
    dimensionId,
    tap,
    ray,
    itemUse,
  }: {
    playerId: PlayerId;
    intent: PressIntent["kind"];
    dimensionId?: DimensionId;
    tap?: BlockTap;
    ray?: Ray;
    itemUse?: { aim: AimResult | undefined; tick: number; sneaking: boolean };
  }): FollowUp {
    const session = this.repo.get(playerId);
    const flow = session?.flow;
    const heightRay = ray ?? itemUse?.aim?.ray;
    switch (intent) {
      case "selectPoint":
        if (tap)
          this.actions.setPoint.execute({
            playerId,
            dimensionId: tap.dimensionId,
            cell: tap.cell,
          });
        return "none";
      case "fixEndpoint": {
        if (flow?.kind !== "point1") return "none";
        const end =
          tap?.cell ??
          (itemUse?.aim &&
            virtualAimedEndPoint(
              flow.start.cell,
              itemUse.aim,
              this.blocks.heightRange(flow.start.dimensionId),
            ));
        this.actions.tapAir.execute({ playerId, end });
        return "none";
      }
      case "confirmLiveHeight":
        if (!session || flow?.kind !== "baseHeight" || !heightRay)
          return "none";
        session.aimHeight(
          heightRay,
          this.blocks.heightRange(flow.start.dimensionId),
        );
        return session.confirmLiveHeight() ? "utilityMenu" : "none";
      case "aimHeight":
        if (!session || flow?.kind !== "heightStep" || !heightRay)
          return "none";
        if (!flow.heightLocked)
          session.aimHeight(
            heightRay,
            this.blocks.heightRange(flow.start.dimensionId),
          );
        return "contentsMenu";
      case "fixStairGoal":
        if (
          flow?.kind !== "stairAim" ||
          !this.actions.fixStairGoal.execute({ playerId })
        )
          return "none";
        return flow.op === "terrace" ? "terraceMenu" : "stairContents";
      case "openUtilityMenu":
        return flow ? "utilityMenu" : "none";
      case "pasteAim": {
        if (!dimensionId || !itemUse) return "none";
        const result = this.actions.pressPasteAim.execute({
          playerId,
          dimensionId,
          ...itemUse,
        });
        if (result === "pasted") this.actions.onPasted(playerId, itemUse.tick);
        return result === "menu" ? "pasteMenu" : "none";
      }
      case "ignore":
      case "undo":
      case "rotateSelection":
      case "rotateClipboard":
        return "none";
    }
  }
}
