import type { RoofTentId } from "../../../domain/camp/ids";
import {
  withoutSpawnSetters,
  withSpawnSetter,
} from "../../../domain/camp/roofTent/occupancy";
import { cellOf } from "../../../domain/shared/cells";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  ROOF_TENT_SPAWN_SET_BY_PROPERTY,
  ROOF_TENT_SPAWN_SETTERS_PROPERTY,
} from "../identifiers";
import { encodeSpawnSetters } from "../persistence/roofTentState";
import { roofTentEntity } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants } from "./roofTentOccupants";
export class RoofTentSpawn {
  constructor(private readonly occupants: RoofTentOccupants) {}

  spawnCellOf(id: RoofTentId): Vec3 {
    const location = this.occupants.record(id)?.location;
    if (!location) throw new Error(`Unknown roof tent: ${id}`);
    return cellOf(location);
  }

  spawnSetters(id: RoofTentId): readonly PlayerId[] {
    return this.occupants.record(id)?.state.spawnSetters ?? [];
  }

  addSpawnSetter(id: RoofTentId, playerId: PlayerId): void {
    const tent = this.occupants.record(id);
    if (!tent) return;
    const state = withSpawnSetter(tent.state, playerId);
    const entity = roofTentEntity(id);
    entity?.setDynamicProperty(
      ROOF_TENT_SPAWN_SETTERS_PROPERTY,
      encodeSpawnSetters(state.spawnSetters),
    );
    // Keep the latest sleeper visible to packs that predate ADR 0231.
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY, playerId);
    this.occupants.updateState(id, () => state);
  }

  clearSpawnSetters(id: RoofTentId): void {
    const entity = roofTentEntity(id);
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SETTERS_PROPERTY, undefined);
    entity?.setDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY, undefined);
    this.occupants.updateState(id, withoutSpawnSetters);
  }

  dimensionOf(id: RoofTentId) {
    const saved = this.occupants.record(id);
    if (!saved) throw new Error(`Unknown roof tent: ${id}`);
    return asDimensionId(saved.dimension.id);
  }
}
