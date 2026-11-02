import { hostVerdict } from "../../domain/camp/roofTent/hostRule";
import type { VehicleHostLookup } from "../shared/ports/vehicleHost";
import type {
  OccupantEjector,
  RoofTentRemoved,
  RoofTentWorld,
} from "./ports/roofTent";

export class RoofTentHostGuard {
  constructor(
    private readonly world: RoofTentWorld,
    private readonly vehicleHost: VehicleHostLookup,
    private readonly ejector: OccupantEjector,
    private readonly removed: RoofTentRemoved,
  ) {}

  check(): void {
    for (const id of this.world.loaded()) {
      const host = this.world.hostOf(id);
      if (host.kind !== "vehicle") continue;
      const state = this.vehicleHost(host.id);
      const verdict = hostVerdict({
        presence: state.status,
        driverPresent: state.status === "present" && state.driverPresent,
        moving: state.status === "present" && state.moving,
      });
      if (verdict !== "remove") continue;
      this.ejector.eject(id);
      const owner = this.world.ownerOf(id);
      this.world.returnItem(id, owner);
      this.world.remove(id);
      this.removed.removed(id, owner);
    }
  }
}
