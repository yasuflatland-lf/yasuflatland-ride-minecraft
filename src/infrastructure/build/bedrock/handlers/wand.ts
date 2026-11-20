import { system, world } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmLiveHeight } from "../../../../application/build/confirmLiveHeight";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import type { BuildFlow } from "../../../../domain/build/flow/flow";
import { routePress } from "../../../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { Cell } from "../../../../domain/shared/cells";
import type { Debounces } from "../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { buildItemRole } from "../../identifiers";
import type { BuildMenus } from "../buildMenus";
import { heldBuildItem } from "../heldBuildItem";
import { dispatchWandPress } from "./wandPress";

export function registerWand({
  setPoint,
  tapAir,
  pressPasteAim,
  aimHeight,
  confirmLiveHeight,
  repo,
  menus,
  aim,
  debounce,
  pasteDebounce,
  pointOf,
}: {
  setPoint: SetPoint;
  tapAir: TapAir;
  pressPasteAim: PressPasteAim;
  aimHeight: AimHeight;
  confirmLiveHeight: ConfirmLiveHeight;
  repo: BuildSessionRepository;
  menus: BuildMenus;
  aim: AimReader;
  debounce: Debounces<PlayerId>;
  pasteDebounce: Debounces<PlayerId>;
  pointOf(playerId: PlayerId): Cell | undefined;
}): void {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) === "wand") ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) !== "wand") return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const playerId = asPlayerId(player.id);
    const routeBlockPress = (flow: BuildFlow | undefined) =>
      routePress({
        flow: flow ?? { kind: "idle" },
        role: "wand",
        route: "blockInteract",
        target: "block",
        sneaking: player.isSneaking,
      });
    const intent = routeBlockPress(repo.get(playerId)?.flow).kind;
    if (intent === "ignore") return;
    const command = {
      playerId,
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    system.run(() => {
      if (!player.isValid) return;
      const flow = repo.get(command.playerId)?.flow;
      // A deferred confirmation can race an item-use event from the same press.
      if (routeBlockPress(flow).kind !== intent) return;
      switch (intent) {
        case "confirmLiveHeight": {
          const target = aim.aim(playerId);
          if (!target) return;
          debounce.press(playerId, system.currentTick);
          aimHeight.execute({ playerId, ray: target.ray });
          confirmLiveHeight.execute({ playerId });
          break;
        }
        case "aimHeight": {
          if (flow?.kind !== "heightStep") return;
          const target = aim.aim(command.playerId);
          if (!target) return;
          aimHeight.execute({ playerId: command.playerId, ray: target.ray });
          void menus.showContentsMenu(player);
          break;
        }
        case "selectPoint":
          setPoint.execute(command);
          break;
        case "openUtilityMenu":
          void menus.showUtilityMenu(player);
          break;
      }
    });
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || buildItemRole(itemStack.typeId) !== "wand") return;
    const playerId = asPlayerId(source.id);
    // Opening the menu must not swallow the next commit; commits also debounce across anchors.
    const flow = repo.get(playerId)?.flow;
    const tick = system.currentTick;
    const presses =
      source.isSneaking && flow?.kind === "pasteAim" ? pasteDebounce : debounce;
    if (!presses.press(playerId, tick)) return;
    dispatchWandPress({
      source,
      playerId,
      aim,
      repo,
      pressPasteAim,
      aimHeight,
      confirmLiveHeight,
      menus,
      pointOf,
      tapAir,
    });
  });
}
