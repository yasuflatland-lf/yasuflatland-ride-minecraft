import { BlockTypes, system, world } from "@minecraft/server";
import { anchorCell } from "../../../../domain/shared/blockFace";
import { asDimensionId } from "../../../../domain/shared/ids";
import { blockFaceOf } from "../../../shared/faces";
import type { PlaceHostedOnTop } from "../../../shared/tableTop/hosted";
import { DINING_TABLE_TOP } from "../../identifiers";
import type { BedrockFurnitureWorld } from "../bedrockFurnitureWorld";

export function registerFurnitureTopInteraction(
  adapter: BedrockFurnitureWorld,
  placeHostedOnTop: PlaceHostedOnTop,
): void {
  // Stable Script API 2.2 has no cancellable playerPlaceBlock event (ADR 0242).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.isFirstEvent && ev.block.typeId === DINING_TABLE_TOP) {
      const owner = adapter.ownerAt(
        asDimensionId(ev.block.dimension.id),
        ev.block.location,
      );
      const table = owner && adapter.entity(owner);
      if (table && placeHostedOnTop(ev.player, table)) {
        ev.cancel = true;
        return;
      }
    }
    if (!ev.itemStack || !BlockTypes.get(ev.itemStack.typeId)) return;
    const destination = anchorCell(
      ev.block.location,
      blockFaceOf(ev.blockFace),
    );
    if (!adapter.hostedAbove(asDimensionId(ev.block.dimension.id), destination))
      return;
    ev.cancel = true;
    const player = ev.player;
    system.run(() => {
      if (player.isValid)
        player.onScreenDisplay.setActionBar({
          translate: "yasu_ride.dining_table.top_occupied",
        });
    });
  });
}
