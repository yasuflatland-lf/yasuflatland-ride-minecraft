import type { VehicleId } from "../../domain/shared/ids";
// Use case: put an item in a vehicle's decor slot or empty it, and save the decor (ADR 0093).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DecorWorld } from "./ports/decor";

export interface SetDecorCommand {
  vehicleId: VehicleId;
  slot: string;
  /** A gear id without the namespace; undefined empties the slot. */
  item: string | undefined;
}

export class SetDecor {
  constructor(
    private readonly world: DecorWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether the decor changed; only then is it saved. */
  execute(cmd: SetDecorCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle?.setDecor(cmd.slot, cmd.item)) return false;
    this.world.saveDecor(cmd.vehicleId, vehicle.decor());
    return true;
  }
}
