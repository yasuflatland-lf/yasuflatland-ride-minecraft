import type { Container } from "@minecraft/server";
import type { NavWorld } from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { NavDestination } from "../../../domain/vehicle/navigation/destinations";
import { chooseFromForm } from "../../shared/choiceForm";
import { countFilledMaps } from "../../shared/filledMaps";
import { messageKey } from "../../shared/identifiers";
import type { ActionBarLog } from "./actionBarLog";
import type { EntityIndex } from "./entityIndex";
import { navDestinationLabelKey, navLootTableId } from "./identifiers";

function countInventoryFilledMaps(inventory: Container): number {
  const items = Array.from({ length: inventory.size }, (_, slot) =>
    inventory.getItem(slot),
  );
  return countFilledMaps(items);
}

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

  giveMap(
    playerId: PlayerId,
    destination: NavDestination,
  ): ReturnType<NavWorld["giveMap"]> {
    const player = this.index.player(playerId);
    if (!player?.isValid) return "unknown";
    const inventory = player.getComponent("minecraft:inventory")?.container;
    const full = inventory?.emptySlotsCount === 0;
    const target = full ? "spawn ~ ~ ~" : "give @s";
    const before =
      inventory && !full ? countInventoryFilledMaps(inventory) : undefined;
    player.runCommand(
      `execute at @s run loot ${target} loot "${navLootTableId(destination)}"`,
    );
    if (!inventory || before === undefined) return "unknown";
    return countInventoryFilledMaps(inventory) > before ? "given" : "nothing";
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.actionBar.write(playerId, { translate: messageKey(name) });
  }
}
