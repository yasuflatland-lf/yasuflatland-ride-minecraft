import type { RoofTentId } from "../../../domain/camp/ids";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  ROOF_TENT_SPAWN_SET_BY_PROPERTY,
  ROOF_TENT_SPAWN_SETTERS_PROPERTY,
} from "../identifiers";
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

  spawnSetters(id: RoofTentId): readonly PlayerId[] {
    return this.occupants.snapshot(id)?.spawnSetters ?? [];
  }

  addSpawnSetter(id: RoofTentId, playerId: PlayerId): void {
    const setters = [...new Set([...this.spawnSetters(id), playerId])];
    const entity = roofTentEntity(id);
    entity?.setDynamicProperty(
      ROOF_TENT_SPAWN_SETTERS_PROPERTY,
      JSON.stringify(setters),
    );
    // Keep the latest sleeper visible to packs that predate ADR 0231.
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY, playerId);
    const saved = this.occupants.snapshots.get(id);
    if (saved) saved.spawnSetters = setters;
  }

  clearSpawnSetters(id: RoofTentId): void {
    const entity = roofTentEntity(id);
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SETTERS_PROPERTY, undefined);
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY, undefined);
    const saved = this.occupants.snapshots.get(id);
    if (saved) saved.spawnSetters = [];
  }

  dimensionOf(id: RoofTentId) {
    const saved = this.occupants.snapshot(id);
    if (!saved) throw new Error(`Unknown roof tent: ${id}`);
    return asDimensionId(saved.dimension.id);
  }
}
