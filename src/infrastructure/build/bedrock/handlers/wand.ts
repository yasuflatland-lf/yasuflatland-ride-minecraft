import { system, world } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmBoxStep } from "../../../../application/build/confirmBoxStep";
import type { FinishRotateMode } from "../../../../application/build/finishRotateMode";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotateModeTap } from "../../../../application/build/rotateModeTap";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
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
import { dispatchWandPress } from "./wandPress";

export function registerWand({
  setPoint,
  tapAir,
  pressPasteAim,
  rotateModeTap,
  finishRotateMode,
  aimHeight,
  confirmBoxStep,
  repo,
  menus,
  aim,
  debounce,
  pasteDebounce,
  rotateDebounce,
  pointOf,
}: {
  setPoint: SetPoint;
  tapAir: TapAir;
  pressPasteAim: PressPasteAim;
  rotateModeTap: Pick<RotateModeTap, "execute">;
  finishRotateMode: Pick<FinishRotateMode, "execute">;
  aimHeight: AimHeight;
  confirmBoxStep: Pick<ConfirmBoxStep, "execute">;
  repo: BuildSessionRepository;
  menus: BuildMenus;
  aim: AimReader;
  debounce: PressDebounces<PlayerId>;
  pasteDebounce: PressDebounces<PlayerId>;
  rotateDebounce: PressDebounces<PlayerId>;
  pointOf(playerId: PlayerId): Cell | undefined;
}): void {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) === SELECTION_WAND_TYPE) ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) !== SELECTION_WAND_TYPE) return;
    ev.cancel = true;
    // itemUse owns mode presses, including duplicate block-interaction events.
    const kind = repo.get(asPlayerId(ev.player.id))?.flow.kind;
    if (kind === "pasteAim" || kind === "rotateMode") return;
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
      if (flow?.kind === "pasteAim" || flow?.kind === "rotateMode") return;
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
    // Opening the menu must not swallow the next commit; commits also debounce across anchors.
    const flow = repo.get(playerId)?.flow;
    const tick = system.currentTick;
    const presses =
      flow?.kind === "rotateMode"
        ? rotateDebounce
        : source.isSneaking && flow?.kind === "pasteAim"
          ? pasteDebounce
          : debounce;
    // A held finish press must not open utilities after returning to endpoint.
    if (flow?.kind === "rotateMode") debounce.press(playerId, tick);
    if (!presses.press(playerId, tick)) return;
    dispatchWandPress({
      source,
      playerId,
      aim,
      repo,
      pressPasteAim,
      rotateModeTap,
      finishRotateMode,
      aimHeight,
      confirmBoxStep,
      menus,
      pointOf,
      tapAir,
    });
  });
}
