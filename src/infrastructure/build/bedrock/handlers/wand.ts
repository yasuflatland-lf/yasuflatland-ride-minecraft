import { Direction, system, world } from "@minecraft/server";
import type { PasteAt } from "../../../../application/build/pasteAt";
import type { AimReader } from "../../../../application/build/ports/aim";
import type { BuildMenus } from "../../../../application/build/ports/menus";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import { virtualEndPoint } from "../../../../domain/build/aim/aim";
import type { Face } from "../../../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import type { Cell } from "../../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import type { PressDebounces } from "../../../../domain/shared/pressDebounce";
import { heldTypeId } from "../../../shared/heldItem";
import { SELECTION_WAND_TYPE } from "../../identifiers";

export function registerWand({
  setPoint,
  tapAir,
  menus,
  aim,
  debounce,
  pointOf,
  repo,
  pasteAt,
}: {
  repo: BuildSessionRepository;
  pasteAt: PasteAt;
  setPoint: SetPoint;
  tapAir: TapAir;
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
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const command = {
      playerId: asPlayerId(player.id),
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    const face = ev.blockFace;
    system.run(() => {
      if (!player.isValid) return;
      if (repo.get(command.playerId)?.flow.kind === "pasteAim") {
        const faces: Record<Direction, Face> = {
          [Direction.Up]: "up",
          [Direction.Down]: "down",
          [Direction.North]: "north",
          [Direction.South]: "south",
          [Direction.East]: "east",
          [Direction.West]: "west",
        };
        pasteAt.execute({ ...command, block: command.cell, face: faces[face] });
      } else setPoint.execute(command);
    });
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || itemStack.typeId !== SELECTION_WAND_TYPE) return;
    const playerId = asPlayerId(source.id);
    if (!debounce.press(playerId, system.currentTick)) return;
    const target = aim.aim(playerId);
    // A block tap can also emit itemUse; only the interact handler owns that tap.
    if (!target || target.block) return;
    if (source.isSneaking) {
      menus.openUtility(playerId);
      return;
    }
    const point1 = pointOf(playerId);
    const end = point1 ? virtualEndPoint(point1, target.ray) : undefined;
    tapAir.execute({ playerId, end });
  });
}
