import { system, world } from "@minecraft/server";
import type { AimHeight } from "../../../../application/build/aimHeight";
import type { ConfirmLiveHeight } from "../../../../application/build/confirmLiveHeight";
import type { FixStairGoal } from "../../../../application/build/fixStairGoal";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import { acceptsAnyItemUse } from "../../../../domain/build/flow/flow";
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
import {
  type BlockPressContext,
  dispatchWandPress,
  pressBlockCell,
} from "./wandPress";

export function registerWand({
  setPoint,
  tapAir,
  pressPasteAim,
  aimHeight,
  confirmLiveHeight,
  fixStairGoal,
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
  fixStairGoal: FixStairGoal;
  repo: BuildSessionRepository;
  menus: BuildMenus;
  aim: AimReader;
  debounce: Debounces<PlayerId>;
  pasteDebounce: Debounces<PlayerId>;
  pointOf(playerId: PlayerId): Cell | undefined;
}): void {
  const blockPressContext: BlockPressContext = {
    aim,
    aimHeight,
    confirmLiveHeight,
    debounce,
    fixStairGoal,
    menus,
    repo,
    setPoint,
  };
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) === "wand") ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) !== "wand") return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const playerId = asPlayerId(player.id);
    const flow = repo.get(playerId)?.flow ?? { kind: "idle" };
    const intent = routePress({
      flow,
      role: "wand",
      route: "blockInteract",
      target: "block",
      sneaking: player.isSneaking,
    }).kind;
    if (intent === "ignore") return;
    // A PC right-click can emit itemUse before the deferred block action runs.
    if (
      (intent === "confirmLiveHeight" || intent === "openUtilityMenu") &&
      acceptsAnyItemUse(flow) &&
      !debounce.press(playerId, system.currentTick)
    )
      return;
    const command = {
      player,
      playerId,
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    system.run(() => pressBlockCell(blockPressContext, command, intent));
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
      fixStairGoal,
      menus,
      pointOf,
      tapAir,
    });
  });
}
