import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import {
  CAMPER_ROOM,
  type CamperRoom,
} from "../../../domain/vehicle/kinds/index";
// Use case: a player long-pressed a decor block with an empty hand (ADR 0093).
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports";

type RemoveDecorCommand = Parameters<CamperRoom["decor"]["removeDecor"]>[0] & {
  playerId: PlayerId;
  vehicleId: VehicleId;
};

export class RemoveDecor {
  constructor(
    private readonly world: Pick<
      DecorPlacingWorld,
      "saveDecor" | "giveDecorItems"
    >,
    private readonly repo: VehicleRepository,
  ) {}

  /** Returns whether decor was taken out; only then is the decor saved and the item given. */
  execute({ playerId, vehicleId, ...press }: RemoveDecorCommand): boolean {
    const decor = this.repo.get(vehicleId)?.capability(CAMPER_ROOM)?.decor;
    const item = decor?.removeDecor(press);
    if (!decor || item === undefined) return false;
    this.world.saveDecor(vehicleId, decor.decor());
    this.world.giveDecorItems(playerId, [item]);
    return true;
  }
}
