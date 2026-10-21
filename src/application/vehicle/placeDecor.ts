import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player long-pressed a parked vehicle's room holding a camping gear item (ADR 0093, 0097).
import { DECOR_MESSAGES } from "../../domain/vehicle/dock/decorMessages";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports/decor";

export interface PlaceDecorCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The camping gear id of the held item. */
  item: string;
  /** The world point the player pressed. */
  point: Vec3;
  /** The world cell of the block the player pressed (ADR 0097). */
  cell: Vec3;
  /** The hotbar slot that held the item when the player pressed. */
  hotbarSlot: number;
  /** The press names one slot (a dinette deck seat); refuse instead of falling back to another slot (ADR 0104). */
  exact: boolean;
}

export class PlaceDecor {
  constructor(
    private readonly world: DecorPlacingWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether the item was placed; only then is the decor saved. */
  execute(cmd: PlaceDecorCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle) return false;
    const slot = vehicle.decorSlotFor(
      cmd.item,
      cmd.point,
      cmd.cell,
      cmd.exact,
      (cells) => this.world.blockTypes(cmd.vehicleId, cells),
    );
    if (slot === undefined) {
      this.world.showMessage(cmd.playerId, DECOR_MESSAGES.noSlot);
      return false;
    }
    // Like a vehicle item, Creative places without taking the item (ADR 0024).
    if (
      !this.world.isCreative(cmd.playerId) &&
      !this.world.consumeDecorItem(cmd.playerId, cmd.hotbarSlot, cmd.item)
    )
      return false;
    if (!vehicle.placeDecor(slot, cmd.item)) return false;
    this.world.saveDecor(cmd.vehicleId, vehicle.decor());
    return true;
  }
}
