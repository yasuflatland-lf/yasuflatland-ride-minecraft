import type { NavWorld } from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { NavDestination } from "../../../domain/vehicle/navigation/destinations";
import { chooseFromForm } from "../../shared/choiceForm";
import { messageKey } from "../../shared/identifiers";
import type { ActionBarLog } from "./actionBarLog";
import type { EntityIndex } from "./entityIndex";
import { navDestinationLabelKey, navLootTableId } from "./identifiers";

export class BedrockNavWorld implements NavWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly actionBar: ActionBarLog,
  ) {}

  dimensionOf(playerId: PlayerId): DimensionId | undefined {
    const player = this.index.player(playerId);
    return player?.isValid ? asDimensionId(player.dimension.id) : undefined;
  }

  async choose(
    playerId: PlayerId,
    options: readonly NavDestination[],
  ): Promise<NavDestination | undefined> {
    const player = this.index.player(playerId);
    if (!player?.isValid) return undefined;
    const choice = await chooseFromForm(
      player,
      "yasu_ride.nav.title",
      options.map((id) => ({ id, textKey: navDestinationLabelKey(id) })),
    );
    return choice === "cancel" ? undefined : choice;
  }

  giveMap(playerId: PlayerId, destination: NavDestination): "unknown" {
    const player = this.index.player(playerId);
    if (!player?.isValid) return "unknown";
    const inventory = player.getComponent("minecraft:inventory")?.container;
    const target = inventory?.emptySlotsCount === 0 ? "spawn ~ ~ ~" : "give @s";
    player.runCommand(
      `execute at @s run loot ${target} loot "${navLootTableId(destination)}"`,
    );
    // Bedrock's success count cannot distinguish an explorer map from a blank map.
    return "unknown";
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.actionBar.write(playerId, { translate: messageKey(name) });
  }
}
