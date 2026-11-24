import type { Ray } from "../../domain/build/aim/aim";
import { virtualAimedEndPoint } from "../../domain/build/aim/endPoint";
import type { PressIntent } from "../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { AimHeight } from "./aimHeight";
import type { ConfirmLiveHeight } from "./confirmLiveHeight";
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
      aimHeight: AimHeight;
      confirmLiveHeight: ConfirmLiveHeight;
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
    cell,
    ray,
    itemUse,
  }: {
    playerId: PlayerId;
    intent: PressIntent["kind"];
    dimensionId?: DimensionId;
    cell?: Cell;
    ray?: Ray;
    itemUse?: { aim: AimResult | undefined; tick: number; sneaking: boolean };
  }): FollowUp {
    const flow = this.repo.get(playerId)?.flow;
    const heightRay = ray ?? itemUse?.aim?.ray;
    switch (intent) {
      case "selectPoint":
        if (dimensionId && cell)
          this.actions.setPoint.execute({ playerId, dimensionId, cell });
        return "none";
      case "fixEndpoint": {
        if (flow?.kind !== "point1") return "none";
        const end =
          cell ??
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
        if (flow?.kind !== "baseHeight" || !heightRay) return "none";
        this.actions.aimHeight.execute({ playerId, ray: heightRay });
        return this.actions.confirmLiveHeight.execute({ playerId })
          ? "utilityMenu"
          : "none";
      case "aimHeight":
        if (flow?.kind !== "heightStep" || !heightRay) return "none";
        this.actions.aimHeight.execute({ playerId, ray: heightRay });
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
