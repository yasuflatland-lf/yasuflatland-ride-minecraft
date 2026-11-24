import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type {
  DecorItemId,
  DecorSlotId,
} from "../../../domain/vehicle/kinds/index";
// Use case: a player long-pressed a parked vehicle's room holding a camping gear item (ADR 0093, 0097).
import {
  CAMPER_ROOM,
  type CamperRoom,
  DECOR_MESSAGES,
} from "../../../domain/vehicle/kinds/index";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports";

type SlotForPress = Parameters<CamperRoom["decor"]["decorSlotFor"]>;

export type PlaceDecorCommand = SlotForPress[1] & {
  /** Require this exact resolved slot for itemUse drawer placement. */
  slot?: DecorSlotId;
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The camping gear id of the held item. */
  item: DecorItemId;
  /** The hotbar slot that held the item when the player pressed. */
  hotbarSlot: number;
  fallback: SlotForPress[2];
};

export class PlaceDecor {
  constructor(
    private readonly world: DecorPlacingWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether the item was placed; only then is the decor saved. */
  execute({
    playerId,
    vehicleId,
    item,
    slot: requestedSlot,
    hotbarSlot,
    fallback,
    ...press
  }: PlaceDecorCommand): boolean {
    const vehicle = this.repo.get(vehicleId);
    if (!vehicle) return false;
    const decor = vehicle.capability(CAMPER_ROOM)?.decor;
    const slot = decor?.decorSlotFor(item, press, fallback);
    if (
      slot === undefined ||
      (requestedSlot !== undefined && requestedSlot !== slot)
    ) {
      this.world.showMessage(playerId, DECOR_MESSAGES.noSlot);
      return false;
    }
    // Like a vehicle item, Creative places without taking the item (ADR 0024).
    if (
      !this.world.isCreative(playerId) &&
      !this.world.consumeDecorItem(playerId, hotbarSlot, item)
    )
      return false;
    if (!decor?.placeDecor(slot, item)) return false;
    this.world.saveDecor(vehicleId, decor.decor());
    return true;
  }
}
