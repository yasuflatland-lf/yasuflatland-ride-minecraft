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

type RideMemories = Map<PlayerId, Map<DimensionId, RadarMemory>>;

export class ScanForPlaces {
  private readonly rides = new Map<VehicleId, RideMemories>();
  private cursor = 0;

  constructor(
    private readonly world: RadarWorld,
    private readonly repo: VehicleRepository,
  ) {}

  execute(): void {
    const occupied = new Map<VehicleId, readonly PlayerId[]>();
    for (const id of this.repo.ids()) {
      const riders = this.repo.get(id)?.riderIds;
      if (riders?.length) occupied.set(id, riders);
    }
    for (const [id, memories] of this.rides) {
      const riders = occupied.get(id);
      if (!riders) {
        this.rides.delete(id);
        continue;
      }
      for (const rider of memories.keys()) {
        if (!riders.includes(rider)) memories.delete(rider);
      }
      if (!memories.size) this.rides.delete(id);
    }

    const ids = [...occupied.keys()];
    const selected = ids[this.cursor % ids.length];
    if (selected === undefined) {
      this.cursor = 0;
      return;
    }
    this.cursor = (this.cursor % ids.length) + 1;
    const scannedAt = this.world.position(selected);
    const riders = occupied.get(selected);
    if (scannedAt && riders) {
      this.scan(selected, riders, scannedAt);
    }

    for (const [id, memories] of this.rides) {
      const position = id === selected ? scannedAt : this.world.position(id);
      if (!position) continue;
      for (const [rider, dimensions] of memories) {
        if (!this.world.isQuiet(rider)) continue;
        const report = dimensions
          .get(position.dimensionId)
          ?.next(position.location);
        if (report) this.world.showReport(rider, report);
      }
    }
  }

  private scan(
    id: VehicleId,
    riders: readonly PlayerId[],
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

    const clusters = clusterHits(hits);
    const memories: RideMemories = this.rides.get(id) ?? new Map();
    this.rides.set(id, memories);
    for (const rider of riders) {
      const dimensions =
        memories.get(rider) ?? new Map<DimensionId, RadarMemory>();
      memories.set(rider, dimensions);
      const memory = dimensions.get(dimensionId) ?? new RadarMemory();
      dimensions.set(dimensionId, memory);
      memory.offer(clusters);
    }
  }
}
