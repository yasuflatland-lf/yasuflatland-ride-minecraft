import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { DecorItemId } from "../../../domain/vehicle/kinds/index";
import {
  CAMPER_ROOM,
  type DrawerTarget,
  type RoomStorageHost,
  type StoragePressRequest,
} from "../../../domain/vehicle/kinds/index";
// Use case: a player pressed a parked vehicle's storage with doors, such as the wall cabinet,
// with an empty hand (ADR 0114, 0121).
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { Clock } from "../ports/shared";
import type { DecorPlacingWorld } from "./ports";

interface PressStorageCommand extends Omit<StoragePressRequest, "tick"> {
  playerId: PlayerId;
  vehicleId: VehicleId;
}

export class PressStorage {
  constructor(
    private readonly world: Pick<
      DecorPlacingWorld,
      "saveDecor" | "giveDecorItems"
    >,
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  drawerTarget(
    vehicleId: VehicleId,
    press: Parameters<RoomStorageHost["drawerTarget"]>[0],
    item?: DecorItemId,
  ): DrawerTarget | undefined {
    return this.repo
      .get(vehicleId)
      ?.capability(CAMPER_ROOM)
      ?.storage.drawerTarget(press, item);
  }

  /** Returns whether the press did anything; an item taken out is saved and given. */
  execute({ playerId, vehicleId, ...request }: PressStorageCommand): boolean {
    const room = this.repo.get(vehicleId)?.capability(CAMPER_ROOM);
    const press = room?.storage.pressStorage({
      ...request,
      tick: this.clock.now(),
    });
    if (!room || !press) return false;
    if (press.kind === "item") {
      this.world.saveDecor(vehicleId, room.decor.decor());
      this.world.giveDecorItems(playerId, [press.item]);
    }
    return true;
  }
}
