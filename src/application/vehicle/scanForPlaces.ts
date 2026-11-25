import type { DimensionId, PlayerId, VehicleId } from "../../domain/shared/ids";
import {
  clusterHits,
  RadarMemory,
} from "../../domain/vehicle/navigation/radar";
import { RADAR_TARGETS } from "../../domain/vehicle/navigation/radarTargets";
import { SPEC } from "../../domain/vehicle/spec";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { RadarWorld } from "./ports/drive";

const PLACE_BY_MOB = new Map(
  RADAR_TARGETS.flatMap(({ place, mobs }) =>
    mobs.map((mob) => [mob, place] as const),
  ),
);
const MOB_TYPES = [...PLACE_BY_MOB.keys()];

interface DriveMemory {
  driverId: PlayerId;
  dimensions: Map<DimensionId, RadarMemory>;
}

export class ScanForPlaces {
  private readonly drives = new Map<VehicleId, DriveMemory>();
  private cursor = 0;

  constructor(
    private readonly world: RadarWorld,
    private readonly repo: VehicleRepository,
  ) {}

  execute(): void {
    const drivers = new Map<VehicleId, PlayerId>();
    for (const id of this.repo.ids()) {
      const driverId = this.repo.get(id)?.driverId;
      if (driverId !== undefined) drivers.set(id, driverId);
    }
    for (const [id, drive] of this.drives) {
      if (drivers.get(id) !== drive.driverId) this.drives.delete(id);
    }

    const ids = [...drivers.keys()];
    const selected = ids[this.cursor % ids.length];
    if (selected === undefined) {
      this.cursor = 0;
      return;
    }
    this.cursor = (this.cursor % ids.length) + 1;
    const scannedAt = this.world.position(selected);
    const driverId = drivers.get(selected);
    if (scannedAt && driverId !== undefined) {
      this.scan(selected, driverId, scannedAt);
    }

    for (const [id, drive] of this.drives) {
      if (!this.world.isQuiet(drive.driverId)) continue;
      const position = id === selected ? scannedAt : this.world.position(id);
      if (!position) continue;
      const report = drive.dimensions
        .get(position.dimensionId)
        ?.next(position.location);
      if (report) this.world.showReport(drive.driverId, report);
    }
  }

  private scan(
    id: VehicleId,
    driverId: PlayerId,
    { dimensionId, location }: NonNullable<ReturnType<RadarWorld["position"]>>,
  ): void {
    const mobs = this.world.mobsNear(
      dimensionId,
      location,
      SPEC.radarRadius,
      MOB_TYPES,
    );
    const hits = mobs.flatMap(({ typeId, location }) => {
      const place = PLACE_BY_MOB.get(typeId);
      return place === undefined ? [] : [{ place, location }];
    });
    if (!hits.length) return;

    const drive = this.drives.get(id) ?? {
      driverId,
      dimensions: new Map<DimensionId, RadarMemory>(),
    };
    this.drives.set(id, drive);
    const memory = drive.dimensions.get(dimensionId) ?? new RadarMemory();
    drive.dimensions.set(dimensionId, memory);
    memory.offer(clusterHits(hits));
  }
}
