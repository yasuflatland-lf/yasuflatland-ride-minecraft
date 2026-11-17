import { type Player, system, world } from "@minecraft/server";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { PressDebounces } from "../../../../domain/build/pressDebounce";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { buildItemRole, PASTE_ROTATE_TYPE } from "../../identifiers";
import { heldBuildItem } from "../heldBuildItem";

export type PressPasteControl = (args: {
  source: Player;
  typeId: string;
}) => void;

export function registerPasteControls({
  repo,
  aim,
  rotatePasteAim,
  pressPasteAim,
  rotateDebounce,
  pasteDebounce,
  refresh,
}: {
  repo: BuildSessionRepository;
  aim: AimReader;
  rotatePasteAim: RotatePasteAim;
  pressPasteAim: PressPasteAim;
  rotateDebounce: PressDebounces<PlayerId>;
  pasteDebounce: PressDebounces<PlayerId>;
  refresh(playerId: PlayerId, tick: number): void;
}): PressPasteControl {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldBuildItem(ev.player) !== "pasteControl") return;
    ev.cancel = true;
    // A short iPad block tap sends only playerInteractWithBlock (ADR 0203).
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    system.run(() => {
      if (!player.isValid) return;
      const typeId = heldTypeId(player);
      if (!typeId || buildItemRole(typeId) !== "pasteControl") return;
      pressPasteControl({ source: player, typeId });
    });
  });
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (
      heldBuildItem(ev.player) === "pasteControl" &&
      repo.get(asPlayerId(ev.player.id))?.flow.kind === "pasteAim"
    )
      ev.cancel = true;
  });
  const pressPasteControl: PressPasteControl = ({ source, typeId }) => {
    const playerId = asPlayerId(source.id);
    const tick = system.currentTick;
    if (typeId === PASTE_ROTATE_TYPE) {
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
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || buildItemRole(itemStack.typeId) !== "pasteControl")
      return;
    pressPasteControl({ source, typeId: itemStack.typeId });
  });
  return pressPasteControl;
}
