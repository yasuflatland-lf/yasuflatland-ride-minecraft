// Places a low chair from its item, like a vehicle on land (ADR 0008, 0024, 0122).
import { Direction, system, world } from "@minecraft/server";
import type {
  PlaceChair,
  PlaceChairCommand,
} from "../../../../application/camp/placeChair";
import type { ChairFace } from "../../../../domain/camp/chair";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { LOW_CHAIR_ITEM } from "../../identifiers";

const CHAIR_FACE: Readonly<Record<Direction, ChairFace>> = {
  [Direction.Up]: "up",
  [Direction.Down]: "down",
  [Direction.North]: "north",
  [Direction.South]: "south",
  [Direction.East]: "east",
  [Direction.West]: "west",
};

export function registerChairPlacement(placeChair: PlaceChair): void {
  const requested = new TickScopedSet<PlayerId>();
  // The after-event never fires for an item with no use behavior, and a
  // before-event cannot change the world, so the placement runs on the next
  // tick (ADR 0024). A cell the chair cannot take is left alone, so a press on
  // a camper door or another block still works with the chair in hand.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== LOW_CHAIR_ITEM) return;
    const dimensionId = asDimensionId(ev.block.dimension.id);
    const cell = placeChair.cellFor(
      dimensionId,
      ev.block.location,
      CHAIR_FACE[ev.blockFace],
    );
    if (cell === undefined) return;
    // Cancelling keeps the press from also opening or toggling the block underneath.
    ev.cancel = true;
    const playerId = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, playerId)) return;
    const cmd: PlaceChairCommand = {
      playerId,
      dimensionId,
      blockLocation: cell,
      yaw: ev.player.getRotation().y,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => placeChair.execute(cmd));
  });
}
