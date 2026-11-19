import { type Player, system, world } from "@minecraft/server";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { UndoEdit } from "../../../../application/build/undoEdit";
import {
  type PressRole,
  type PressRoute,
  routePress,
} from "../../../../domain/build/flow/press";
import type { PressDebounces } from "../../../../domain/build/pressDebounce";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import {
  BUILD_UNDO_TYPE,
  PASTE_PLACE_TYPE,
  PASTE_ROTATE_TYPE,
} from "../../identifiers";
import { heldBuildItem } from "../heldBuildItem";

type ControlRole = Exclude<PressRole, "wand">;

export interface PasteControlRoutes {
  itemUse(player: Player): void;
  blockInteract(player: Player): void;
}

export function registerPasteControls({
  repo,
  aim,
  rotatePasteAim,
  pressPasteAim,
  undo,
  undoDebounce,
  rotateDebounce,
  pasteDebounce,
  refresh,
}: {
  repo: BuildSessionRepository;
  aim: AimReader;
  rotatePasteAim: RotatePasteAim;
  pressPasteAim: PressPasteAim;
  undo: UndoEdit;
  undoDebounce: PressDebounces<PlayerId>;
  rotateDebounce: PressDebounces<PlayerId>;
  pasteDebounce: PressDebounces<PlayerId>;
  refresh(playerId: PlayerId, tick: number): void;
}): PasteControlRoutes {
  function pressFromBlockTap(player: Player, isFirstEvent: boolean): boolean {
    if (!controlRole(heldTypeId(player))) return false;
    if (!isFirstEvent) return true;
    system.run(() => {
      if (!player.isValid) return;
      const role = controlRole(heldTypeId(player));
      if (role) pressPasteControl(player, role, "blockInteract");
    });
    return true;
  }
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    // A short iPad block tap sends only playerInteractWithBlock (ADR 0203).
    if (pressFromBlockTap(ev.player, ev.isFirstEvent)) ev.cancel = true;
  });
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (
      heldBuildItem(ev.player) === "pasteControl" &&
      repo.get(asPlayerId(ev.player.id))?.flow.kind === "pasteAim"
    )
      ev.cancel = true;
  });
  function pressPasteControl(
    source: Player,
    role: ControlRole,
    route: PressRoute,
  ): void {
    const playerId = asPlayerId(source.id);
    const tick = system.currentTick;
    const intent = routePress({
      flow: repo.get(playerId)?.flow ?? { kind: "idle" },
      role,
      route,
      // Only an accepted Paste Place press needs a live ray.
      target: route === "blockInteract" ? "block" : "none",
      sneaking: source.isSneaking,
    });
    switch (intent.kind) {
      case "undo":
        if (!undoDebounce.press(playerId, tick)) return;
        undo.execute({ playerId });
        break;
      case "rotateClipboard":
        if (!rotateDebounce.press(playerId, tick)) return;
        if (rotatePasteAim.execute({ playerId }) === "rotated")
          refresh(playerId, tick);
        break;
      case "pasteAim":
        if (!pasteDebounce.press(playerId, tick)) return;
        pressPasteAim.execute({
          playerId,
          dimensionId: asDimensionId(source.dimension.id),
          aim: aim.aim(playerId),
          tick,
          sneaking: source.isSneaking,
          intent: "place",
        });
        break;
    }
  }
  function pressFromItemUse(source: Player, typeId: string): void {
    if (!source.isValid) return;
    const role = controlRole(typeId);
    if (role) pressPasteControl(source, role, "itemUse");
  }
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    pressFromItemUse(source, itemStack.typeId);
  });
  return {
    itemUse(player) {
      const typeId = heldTypeId(player);
      if (typeId) pressFromItemUse(player, typeId);
    },
    blockInteract(player) {
      pressFromBlockTap(player, true);
    },
  };
}

function controlRole(typeId: string | undefined): ControlRole | undefined {
  switch (typeId) {
    case BUILD_UNDO_TYPE:
      return "undo";
    case PASTE_ROTATE_TYPE:
      return "pasteRotate";
    case PASTE_PLACE_TYPE:
      return "pastePlace";
  }
}
