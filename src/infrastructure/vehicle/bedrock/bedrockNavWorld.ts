import { system } from "@minecraft/server";
import type { NavWorld } from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { Ticks } from "../../../domain/shared/ticks";
import type { NavDestination } from "../../../domain/vehicle/navigation/destinations";
import { chooseFromForm } from "../../shared/choiceForm";
import { messageKey } from "../../shared/identifiers";
import type { ActionBarLog } from "./actionBarLog";
import type { EntityIndex } from "./entityIndex";
import { navDestinationLabelKey } from "./identifiers";
import { giveExplorerMap } from "./navMapDelivery";

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

  showCreating(playerId: PlayerId, destination: NavDestination): void {
    this.actionBar.write(playerId, {
      translate: messageKey("nav_creating"),
      with: { rawtext: [{ translate: navDestinationLabelKey(destination) }] },
    });
  }

  waitTicks(ticks: Ticks): Promise<void> {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
  }

  giveMap(
    playerId: PlayerId,
    destination: NavDestination,
  ): ReturnType<NavWorld["giveMap"]> {
    const player = this.index.player(playerId);
    if (!player?.isValid) return "unknown";
    return giveExplorerMap(player, destination).result;
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.actionBar.write(playerId, { translate: messageKey(name) });
  }
}
