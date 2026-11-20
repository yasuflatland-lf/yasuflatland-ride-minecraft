import {
  type Dimension,
  type Entity,
  type TeleportOptions,
  world,
} from "@minecraft/server";
import type { VehicleId } from "../../../domain/shared/ids";
import { distanceSq, type Vec3 } from "../../../domain/shared/vec";
import { isVehicleEntity } from "./identifiers";

/** How a helper entity names its vehicle (ADR 0063, 0116). */
export interface OwnedEntityKind {
  readonly ownerProperty: string;
  isType(typeId: string): boolean;
  /** How far from a loading helper its loaded vehicle can be. */
  readonly searchRadius: number;
}

/** Under a pixel (1/16 block), so invisible drift does not move helpers or their riders. */
export const TELEPORT_TOLERANCE = 0.05;

export function ownerIdOf(
  helper: Entity,
  kind: OwnedEntityKind,
): string | undefined {
  const owner = helper.getDynamicProperty(kind.ownerProperty);
  return typeof owner === "string" ? owner : undefined;
}

/** The valid helper with this id whose owner property names the vehicle. */
export function ownedEntity(
  id: string | null | undefined,
  vehicleId: string,
  kind: OwnedEntityKind,
): Entity | undefined {
  const helper = id ? world.getEntity(id) : undefined;
  return helper?.isValid &&
    kind.isType(helper.typeId) &&
    ownerIdOf(helper, kind) === vehicleId
    ? helper
    : undefined;
}

/** The vehicle named by the helper, if loaded within the helper's search radius. */
export function loadedOwnerNear(
  helper: Entity,
  kind: OwnedEntityKind,
): Entity | undefined {
  const owner = ownerIdOf(helper, kind);
  if (owner === undefined) return undefined;
  return helper.dimension
    .getEntities({ location: helper.location, maxDistance: kind.searchRadius })
    .find(
      (entity) =>
        entity.id === owner && entity.isValid && isVehicleEntity(entity.typeId),
    );
}

/** Places a helper in the vehicle's dimension, or returns undefined for a retry next tick. */
export function placeOwned(
  existing: Entity | undefined,
  vehicle: Entity,
  at: Vec3,
  spawn: (dimension: Dimension, at: Vec3) => Entity,
  teleport?: TeleportOptions,
): Entity | undefined {
  const dimension = vehicle.dimension;
  if (existing && existing.dimension.id !== dimension.id) {
    existing.remove();
    existing = undefined;
  }
  try {
    if (!existing) return spawn(dimension, at);
    if (distanceSq(existing.location, at) > TELEPORT_TOLERANCE ** 2)
      existing.teleport(at, teleport);
    return existing;
  } catch {
    // The engine can refuse to place entities in an unloaded chunk.
    return undefined;
  }
}

/** One kind of state the vehicle feature keeps per vehicle in the world. */
export interface PerVehicleState {
  /** Clears the vehicle's state. The entity is undefined when it is gone. */
  release(vehicleId: VehicleId, vehicle: Entity | undefined): void;
  /** Releases every vehicle kept this session that is absent from live. */
  sweepGone(live: ReadonlySet<VehicleId>): void;
}
