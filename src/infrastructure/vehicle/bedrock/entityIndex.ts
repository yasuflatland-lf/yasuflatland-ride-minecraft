// Looks up the entities the vehicle adapters act on. The map is refilled by
// BedrockVehicleWorld.loadedVehicles() every tick so the other adapters reuse
// the same Entity objects instead of asking the world again.
import { type Entity, type Player, world } from "@minecraft/server";
import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";
import { PLAYER_TYPE } from "./identifiers";

export const DIMENSIONS = ["overworld", "nether", "the_end"] as const;

export const isPlayer = (e: Entity): e is Player => e.typeId === PLAYER_TYPE;

export class EntityIndex {
  /** Vehicles collected by loadedVehicles() for this tick. */
  private current = new Map<VehicleId, Entity>();

  /** Forgets the vehicles of the previous tick. */
  clear(): void {
    this.current = new Map();
  }

  track(entity: Entity): void {
    this.current.set(asVehicleId(entity.id), entity);
  }

  /** Ids of the vehicles tracked since the last clear(). */
  trackedIds(): Set<VehicleId> {
    return new Set(this.current.keys());
  }

  /** The vehicles tracked since the last clear(). */
  tracked(): Entity[] {
    return [...this.current.values()];
  }

  entity(id: VehicleId): Entity | undefined {
    const e = this.current.get(id) ?? world.getEntity(id);
    return e?.isValid ? e : undefined;
  }

  player(playerId: string): Player | undefined {
    const player = world.getEntity(playerId);
    return player && isPlayer(player) ? player : undefined;
  }
}
