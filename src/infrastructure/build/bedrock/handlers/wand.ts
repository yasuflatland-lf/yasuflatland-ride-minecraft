import { system, world } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmBoxStep } from "../../../../application/build/confirmBoxStep";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import { virtualEndPoint } from "../../../../domain/build/aim/aim";
import type { PressDebounces } from "../../../../domain/build/pressDebounce";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { isBoxStepKind } from "../../../../domain/build/volume/kind";
import type { Cell } from "../../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { SELECTION_WAND_TYPE } from "../../identifiers";
import type { BuildMenus } from "../buildMenus";

export function registerWand({
  setPoint,
  tapAir,
  pressPasteAim,
  aimHeight,
  confirmBoxStep,
  repo,
  menus,
  aim,
  debounce,
  pointOf,
}: {
  setPoint: SetPoint;
  tapAir: TapAir;
  pressPasteAim: PressPasteAim;
  aimHeight: AimHeight;
  confirmBoxStep: Pick<ConfirmBoxStep, "execute">;
  repo: BuildSessionRepository;
  menus: BuildMenus;
  aim: AimReader;
  debounce: PressDebounces<PlayerId>;
  pointOf(playerId: PlayerId): Cell | undefined;
}): void {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) === SELECTION_WAND_TYPE) ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) !== SELECTION_WAND_TYPE) return;
    ev.cancel = true;
    // ADR 0203: interact only cancels during paste aiming; itemUse owns paste.
    if (repo.get(asPlayerId(ev.player.id))?.flow.kind === "pasteAim") return;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const command = {
      playerId: asPlayerId(player.id),
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    system.run(() => {
      if (!player.isValid) return;
      const flow = repo.get(command.playerId)?.flow;
      if (flow?.kind === "pasteAim") return;
      if (flow?.kind === "heightStep") {
        const target = aim.aim(command.playerId);
        if (!target) return;
        aimHeight.execute({ playerId: command.playerId, ray: target.ray });
        if (isBoxStepKind(flow.heightedKind))
          confirmBoxStep.execute({ playerId: command.playerId });
        else void menus.showContentsMenu(player);
      } else {
        const before = repo.get(command.playerId)?.flow.kind;
        setPoint.execute(command);
        if (
          before !== "endpoint" &&
          repo.get(command.playerId)?.flow.kind === "endpoint"
        )
          void menus.showShapeMenu(player);
      }
    });
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || itemStack.typeId !== SELECTION_WAND_TYPE) return;
    const playerId = asPlayerId(source.id);
    if (!debounce.press(playerId, system.currentTick)) return;
    const target = aim.aim(playerId);
    const flow = repo.get(playerId)?.flow;
    if (!target) return;
    if (flow?.kind === "pasteAim") {
      const result = pressPasteAim.execute({
        playerId,
        dimensionId: asDimensionId(source.dimension.id),
        aim: target,
        tick: system.currentTick,
      });
      if (result === "menu") void menus.showPasteMenu(source);
      return;
    }
    // A block tap can also emit itemUse; only the interact handler owns that tap.
    if (target.block) return;
    if (flow?.kind === "heightStep") {
      aimHeight.execute({ playerId, ray: target.ray });
      if (isBoxStepKind(flow.heightedKind))
        confirmBoxStep.execute({ playerId });
      else void menus.showContentsMenu(source);
      return;
    }
    if (source.isSneaking) {
      void menus.showUtilityMenu(source);
      return;
    }
    const before = repo.get(playerId)?.flow.kind;
    const point1 = pointOf(playerId);
    const end = point1 ? virtualEndPoint(point1, target.ray) : undefined;
    tapAir.execute({ playerId, end });
    if (before !== "endpoint" && repo.get(playerId)?.flow.kind === "endpoint")
      system.run(() => {
        if (source.isValid) void menus.showShapeMenu(source);
      });
  });
}
