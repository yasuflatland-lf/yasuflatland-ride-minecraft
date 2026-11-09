import { BlockTypes, Direction, system, world } from "@minecraft/server";
import { asDimensionId } from "../../../../domain/shared/ids";
import type { PlaceHostedOnTop } from "../../../shared/tableTop/hosted";
import { DINING_TABLE_TOP } from "../../identifiers";
import type { BedrockFurnitureWorld } from "../bedrockFurnitureWorld";

export function registerFurnitureTopInteraction(
  adapter: BedrockFurnitureWorld,
  placeHostedOnTop: PlaceHostedOnTop,
): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(DINING_TABLE_TOP, {
      onPlayerInteract: ({ player, block, dimension }) => {
        if (!player) return;
        const owner = adapter.ownerAt(
          asDimensionId(dimension.id),
          block.location,
        );
        const table = owner && adapter.entity(owner);
        if (table) placeHostedOnTop(player, table);
      },
    });
  });
  // Stable Script API 2.2 has no cancellable playerPlaceBlock event (ADR 0242).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.itemStack || !BlockTypes.get(ev.itemStack.typeId)) return;
    const offsets = {
      [Direction.Up]: { x: 0, y: 1, z: 0 },
      [Direction.Down]: { x: 0, y: -1, z: 0 },
      [Direction.North]: { x: 0, y: 0, z: -1 },
      [Direction.South]: { x: 0, y: 0, z: 1 },
      [Direction.East]: { x: 1, y: 0, z: 0 },
      [Direction.West]: { x: -1, y: 0, z: 0 },
    };
    const offset = offsets[ev.blockFace];
    const at = ev.block.location;
    const destination = {
      x: at.x + offset.x,
      y: at.y + offset.y,
      z: at.z + offset.z,
    };
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
