import { Direction, system, world } from "@minecraft/server";
import type { ClearSelection } from "../../../../application/build/clearSelection";
import type { PasteAt } from "../../../../application/build/pasteAt";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import type { Face } from "../../../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { SELECTION_WAND_TYPE } from "../../identifiers";
import type { BuildMenus } from "../buildMenus";

export function registerWand(
  setPoint: SetPoint,
  tapAir: TapAir,
  clear: ClearSelection,
  repo: BuildSessionRepository,
  pasteAt: PasteAt,
  menus: BuildMenus,
): void {
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
    const cmd = { playerId: asPlayerId(source.id) };
    if (source.isSneaking) clear.execute(cmd);
    else {
      const before = repo.get(cmd.playerId)?.flow.kind;
      tapAir.execute(cmd);
      if (
        before !== "endpoint" &&
        repo.get(cmd.playerId)?.flow.kind === "endpoint"
      )
        system.run(() => {
          if (source.isValid) void menus.showShapeMenu(source);
        });
    }
  });
}
