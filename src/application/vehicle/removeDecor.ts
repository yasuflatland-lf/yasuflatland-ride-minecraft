import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player long-pressed a decor block with an empty hand (ADR 0093).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports/decor";

export interface RemoveDecorCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The world cell of the decor block. */
  cell: Vec3;
  /** Where the press hit the block and the player's eye, to tell the two items of the table apart (ADR 0108, 0110). */
  point?: Vec3;
  eye?: Vec3;
}

export class RemoveDecor {
  constructor(
    private readonly world: Pick<
      DecorPlacingWorld,
      "saveDecor" | "giveDecorItems"
    >,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether decor was taken out; only then is the decor saved and the item given. */
  execute(cmd: RemoveDecorCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    const item = vehicle?.removeDecor(cmd.cell, cmd.point, cmd.eye);
    if (!vehicle || item === undefined) return false;
    this.world.saveDecor(cmd.vehicleId, vehicle.decor());
    this.world.giveDecorItems(cmd.playerId, [item]);
    return true;
  }
}
