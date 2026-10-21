import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { DecorPlacement } from "../../../domain/vehicle/dock/decor";
// Port for saving a vehicle's decor; implemented in the infrastructure layer (ADR 0012, 0093).

export interface DecorWorld {
  /** Saves the vehicle's whole decor on its entity; does nothing for a missing vehicle. */
  saveDecor(vehicleId: VehicleId, decor: readonly DecorPlacement[]): void;
}

/** What placing and removing decor by hand needs besides saving it (ADR 0024, 0093). */
export interface DecorPlacingWorld extends DecorWorld {
  isCreative(playerId: PlayerId): boolean;
  /** Takes one `item` (a camping gear id) from the hotbar slot; false when that slot no longer holds it. */
  consumeDecorItem(
    playerId: PlayerId,
    hotbarSlot: number,
    item: string,
  ): boolean;
  /** Puts one of each item (camping gear ids) into the player's inventory and drops what does not fit at the player's feet; does nothing for a missing player. */
  giveDecorItems(playerId: PlayerId, items: readonly string[]): void;
  /** Shows the lang key yasu_ride.message.<name> on a player's action bar; does nothing for a missing player. */
  showMessage(playerId: PlayerId, name: string): void;
  /** See TickContext.blockTypes; world cells, in the vehicle's dimension, so decor skips a slot cell holding a player's block (ADR 0108). */
  blockTypes(
    vehicleId: VehicleId,
    cells: readonly Vec3[],
  ): (string | undefined)[];
}
