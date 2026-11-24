import type { VehicleId } from "../../../domain/shared/ids";
import type {
  DecorItemId,
  DecorSlotId,
} from "../../../domain/vehicle/dock/decor";
import { CAMPER_ROOM } from "../../../domain/vehicle/kinds/index";
// Use case: put an item in a vehicle's decor slot or empty it, and save the decor (ADR 0093).
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { DecorWorld } from "./ports";

export interface SetDecorCommand {
  vehicleId: VehicleId;
  slot: DecorSlotId;
  /** A gear id without the namespace; undefined empties the slot. */
  item: DecorItemId | undefined;
}

export class SetDecor {
  constructor(
    private readonly world: DecorWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether the decor changed; only then is it saved. */
  execute(cmd: SetDecorCommand): boolean {
    const decor = this.repo.get(cmd.vehicleId)?.capability(CAMPER_ROOM)?.decor;
    if (!decor?.setDecor(cmd.slot, cmd.item)) return false;
    this.world.saveDecor(cmd.vehicleId, decor.decor());
    return true;
  }
}
