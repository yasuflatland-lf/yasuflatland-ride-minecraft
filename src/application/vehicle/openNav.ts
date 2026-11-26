import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import { NAV_DESTINATIONS } from "../../domain/vehicle/navigation/destinations";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { NavSelections } from "./navSelections";
import type { NavWorld } from "./ports/drive";

export class OpenNav {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly world: NavWorld,
    private readonly selections: NavSelections,
  ) {}

  async execute({
    playerId,
    vehicleId,
  }: {
    playerId: PlayerId;
    vehicleId: VehicleId | undefined;
  }): Promise<void> {
    if (this.selections.has(playerId)) return;
    if (
      vehicleId === undefined ||
      this.repo.get(vehicleId)?.driverId !== playerId
    ) {
      this.world.showMessage(playerId, "nav_driver_only");
      return;
    }
    if (this.world.dimensionOf(playerId) !== "minecraft:overworld") {
      this.world.showMessage(playerId, "nav_overworld_only");
      return;
    }

    if (!this.selections.begin(playerId)) return;
    try {
      const destination = await this.world.choose(playerId, NAV_DESTINATIONS);
      if (
        destination === undefined ||
        this.repo.get(vehicleId)?.driverId !== playerId
      )
        return;
      if (this.world.giveMap(playerId, destination) === "nothing") {
        this.world.showMessage(playerId, "nav_nothing_found");
      }
    } finally {
      this.selections.end(playerId);
    }
  }
}
