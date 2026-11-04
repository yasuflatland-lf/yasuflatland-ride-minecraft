import type { RoofTentId } from "../../../domain/camp/ids";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { ROOF_TENT_SPAWN_SET_BY_PROPERTY } from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants } from "./roofTentOccupants";
export class RoofTentSpawn {
  constructor(private readonly occupants: RoofTentOccupants) {}

  spawnCellOf(id: RoofTentId): Vec3 {
    const location = this.occupants.snapshot(id)?.location;
    if (!location) throw new Error(`Unknown roof tent: ${id}`);
    return {
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z),
    };
  }

  spawnSetBy(id: RoofTentId): PlayerId | undefined {
    return this.occupants.snapshot(id)?.spawnSetBy;
  }

  setSpawnSetBy(id: RoofTentId, playerId: PlayerId | undefined): void {
    roofTentEntity(id)?.setDynamicProperty(
      ROOF_TENT_SPAWN_SET_BY_PROPERTY,
      playerId,
    );
    const saved = this.occupants.snapshots.get(id);
    if (saved) saved.spawnSetBy = playerId;
  }

  dimensionOf(id: RoofTentId) {
    const saved = this.occupants.snapshot(id);
    if (!saved) throw new Error(`Unknown roof tent: ${id}`);
    return asDimensionId(saved.dimension.id);
  }
}
