import { type Player, system, world } from "@minecraft/server";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { UndoEdit } from "../../../../application/build/undoEdit";
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
  buildItemRole,
  PASTE_ROTATE_TYPE,
} from "../../identifiers";
import { heldBuildItem } from "../heldBuildItem";

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
    const role = heldBuildItem(player);
    if (role !== "pasteControl" && role !== "undo") return false;
    if (!isFirstEvent) return true;
    system.run(() => {
      if (!player.isValid) return;
      const typeId = heldTypeId(player);
      if (!typeId || !isControl(typeId)) return;
      pressPasteControl({ source: player, typeId });
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
  const pressPasteControl = ({
    source,
    typeId,
  }: {
    source: Player;
    typeId: string;
  }) => {
    const playerId = asPlayerId(source.id);
    const tick = system.currentTick;
    if (typeId === BUILD_UNDO_TYPE) {
      if (!undoDebounce.press(playerId, tick)) return;
      undo.execute({ playerId });
    } else if (typeId === PASTE_ROTATE_TYPE) {
      if (!rotateDebounce.press(playerId, tick)) return;
      if (rotatePasteAim.execute({ playerId }) === "rotated")
        refresh(playerId, tick);
    } else {
      if (!pasteDebounce.press(playerId, tick)) return;
      pressPasteAim.execute({
        playerId,
        dimensionId: asDimensionId(source.dimension.id),
        aim: aim.aim(playerId),
        tick,
        sneaking: source.isSneaking,
        intent: "place",
      });
    }
  };
  function pressFromItemUse(source: Player, typeId: string): void {
    if (!source.isValid || !isControl(typeId)) return;
    pressPasteControl({ source, typeId });
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

function isControl(typeId: string): boolean {
  const role = buildItemRole(typeId);
  return role === "pasteControl" || role === "undo";
}
