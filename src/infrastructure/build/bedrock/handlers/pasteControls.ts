import { type Player, system, world } from "@minecraft/server";
import type { PressGaps } from "../../../../application/build/pressGaps";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { PressUndo } from "../../../../application/build/pressUndo";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { RotateSelection } from "../../../../application/build/rotateSelection";
import {
  type PressRole,
  type PressRoute,
  routePress,
} from "../../../../domain/build/flow/press";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { Debounces } from "../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { buildItemRole } from "../../identifiers";
import { heldBuildItem } from "../heldBuildItem";

type ControlRole = Exclude<PressRole, "wand">;

export interface PasteControlRoutes {
  itemUse(player: Player): void;
  blockInteract(player: Player): void;
}

export function registerPasteControls({
  repo,
  pressGaps,
  rotatePasteAim,
  rotateSelection,
  pressPasteAim,
  pressUndo,
  undoDebounce,
  rotateDebounce,
  pasteDebounce,
  refresh,
  refreshAfterPastePress,
}: {
  repo: BuildSessionRepository;
  pressGaps: PressGaps;
  rotatePasteAim: RotatePasteAim;
  rotateSelection: Pick<RotateSelection, "execute">;
  pressPasteAim: PressPasteAim;
  pressUndo: Pick<PressUndo, "execute">;
  undoDebounce: Debounces<PlayerId>;
  rotateDebounce: Debounces<PlayerId>;
  pasteDebounce: Debounces<PlayerId>;
  refresh(playerId: PlayerId, tick: number): void;
  refreshAfterPastePress(playerId: PlayerId, tick: number): void;
}): PasteControlRoutes {
  function pressFromBlockTap(player: Player, isFirstEvent: boolean): boolean {
    const held = controlRole(heldTypeId(player));
    if (!held) return false;
    if (!isFirstEvent) {
      if (held === "pastePlace") {
        const playerId = asPlayerId(player.id);
        const tick = system.currentTick;
        pressGaps.note(playerId, tick);
        pasteDebounce.record(playerId, tick);
      }
      return true;
    }
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
    const held = heldBuildItem(ev.player);
    if (
      (held === "pastePlace" || held === "pasteRotate") &&
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
      target: route === "blockInteract" ? "block" : "none",
      sneaking: source.isSneaking,
    });
    switch (intent.kind) {
      case "undo":
        if (!undoDebounce.press(playerId, tick)) return;
        if (pressUndo.execute({ playerId }) === "stepped")
          refresh(playerId, tick);
        break;
      case "rotateSelection":
        if (!rotateDebounce.press(playerId, tick)) return;
        rotateSelection.execute({
          playerId,
          dimensionId: asDimensionId(source.dimension.id),
        });
        break;
      case "rotateClipboard":
        if (!rotateDebounce.press(playerId, tick)) return;
        if (rotatePasteAim.execute({ playerId }) === "rotated")
          refresh(playerId, tick);
        break;
      case "pasteAim": {
        const quietTicks = pressGaps.note(playerId, tick);
        if (!pasteDebounce.press(playerId, tick)) return;
        const outcome = pressPasteAim.execute({
          playerId,
          dimensionId: asDimensionId(source.dimension.id),
          quietTicks,
          tick,
          sneaking: source.isSneaking,
          intent: "place",
        });
        if (outcome === "aiming" || outcome === "pasted")
          refreshAfterPastePress(playerId, tick);
        break;
      }
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
  const role = buildItemRole(typeId);
  return role === "wand" ? undefined : role;
}
