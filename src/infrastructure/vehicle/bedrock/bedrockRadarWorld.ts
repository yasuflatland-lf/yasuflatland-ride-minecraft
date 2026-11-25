import { system, world } from "@minecraft/server";
import type { RadarWorld } from "../../../application/vehicle/ports/drive";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { RadarReport } from "../../../domain/vehicle/navigation/radar";
import type { ActionBarLog } from "./actionBarLog";
import type { EntityIndex } from "./entityIndex";

export class BedrockRadarWorld implements RadarWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly actionBar: ActionBarLog,
  ) {}

  position(vehicleId: VehicleId) {
    try {
      const vehicle = this.index.entity(vehicleId);
      if (vehicle)
        return {
          dimensionId: asDimensionId(vehicle.dimension.id),
          location: vehicle.location,
        };
    } catch {
      // A vehicle can unload between indexing and the scan.
    }
    return undefined;
  }

  mobsNear(
    dimensionId: DimensionId,
    center: Vec3,
    radius: number,
    types: readonly string[],
  ) {
    try {
      const dimension = world.getDimension(dimensionId);
      return types.flatMap((type) => {
        try {
          return dimension
            .getEntities({ location: center, maxDistance: radius, type })
            .map(({ typeId, location }) => ({ typeId, location }));
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  isQuiet(playerId: PlayerId): boolean {
    return this.actionBar.quietSince(playerId, system.currentTick);
  }

  showReport(playerId: PlayerId, report: RadarReport): void {
    this.actionBar.write(playerId, {
      translate: "yasu_ride.radar.report",
      with: {
        rawtext: [
          { translate: `yasu_ride.radar.dir.${report.direction}` },
          { text: String(report.distance) },
          { translate: `yasu_ride.radar.place.${report.place}` },
        ],
      },
    });
  }
}
