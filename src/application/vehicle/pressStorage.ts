import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player pressed a parked vehicle's storage with doors, such as the wall cabinet,
// with an empty hand (ADR 0114, 0121).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports/decor";
import type { Clock } from "./ports/shared";

export interface PressStorageCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The world cell of the pressed block: a compartment or an open door's plate. */
  cell: Vec3;
  /** Where the press hit the block, to tell the two items of a compartment apart. */
  point?: Vec3;
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

  /** Returns whether the press did anything; an item taken out is saved and given. */
  execute(cmd: PressStorageCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    const press = vehicle?.pressStorage(cmd.cell, cmd.point, this.clock.now());
    if (!vehicle || !press) return false;
    if (press.kind === "item") {
      this.world.saveDecor(cmd.vehicleId, vehicle.decor());
      this.world.giveDecorItems(cmd.playerId, [press.item]);
    }
    return true;
  }
}
