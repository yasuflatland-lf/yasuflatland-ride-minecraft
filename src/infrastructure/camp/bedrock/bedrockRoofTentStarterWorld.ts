import { ItemStack } from "@minecraft/server";
import type { RoofTentStarterWorld } from "../../../application/camp/ports/roofTentStarter";
import type { PlayerId } from "../../../domain/shared/ids";
import { giveOrDrop, isCreative, playerById } from "../../shared/players";
import {
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
} from "../identifiers";

export class BedrockRoofTentStarterWorld implements RoofTentStarterWorld {
  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerById(playerId));
  }

  received(playerId: PlayerId): boolean | undefined {
    const player = playerById(playerId);
    if (!player) return undefined;
    return (
      player.getDynamicProperty(ROOF_TENT_STARTER_RECEIVED_PROPERTY) === true
    );
  }

  markReceived(playerId: PlayerId): void {
    playerById(playerId)?.setDynamicProperty(
      ROOF_TENT_STARTER_RECEIVED_PROPERTY,
      true,
    );
  }

  give(playerId: PlayerId): void {
    const player = playerById(playerId);
    if (player) giveOrDrop(player, [new ItemStack(ROOF_TENT_ITEM, 1)]);
  }
}
