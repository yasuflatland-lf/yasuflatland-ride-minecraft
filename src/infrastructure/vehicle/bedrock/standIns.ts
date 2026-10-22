// The stand-in entities that take a vehicle's hits and interactions where its own
// hitboxes cannot follow its heading, such as the camper's bumper (ADR 0116).
import { type Entity, world } from "@minecraft/server";
import type { VehicleId } from "../../../domain/shared/ids";
import { STAND_IN_REACH } from "../../../domain/vehicle/kinds/index";
import type { StandInPose } from "../../../domain/vehicle/standIn";
import { DIMENSIONS } from "./entityIndex";
import {
  isStandInEntity,
  isVehicleEntity,
  STAND_IN_FAMILY,
  STAND_IN_OF_PROPERTY,
  STAND_IN_PROPERTY,
  standInType,
} from "./identifiers";

// Under a pixel (1/16 block), as the deck seats: a parked vehicle's stand-in is not
// teleported every tick for drift nobody can see.
const TELEPORT_TOLERANCE = 0.05;
// A driving stand-in trails its vehicle by one tick's move, up to about 1.3 blocks on
// default ground (ADR 0067); the margin finds a loaded owner, or another stand-in of the
// same vehicle, past that.
const SEARCH_MARGIN = 5;
const SEARCH_RADIUS = STAND_IN_REACH + SEARCH_MARGIN;

function ownerOf(standIn: Entity): string | undefined {
  const owner = standIn.getDynamicProperty(STAND_IN_OF_PROPERTY);
  return typeof owner === "string" ? owner : undefined;
}

function standInEntity(
  id: string | undefined,
  vehicleId: string,
): Entity | undefined {
  const standIn = id ? world.getEntity(id) : undefined;
  return standIn?.isValid &&
    isStandInEntity(standIn.typeId) &&
    ownerOf(standIn) === vehicleId
    ? standIn
    : undefined;
}

/**
 * The vehicle an entity a player hit or used stands for: the vehicle itself, or the
 * loaded vehicle a stand-in belongs to; undefined for anything else (ADR 0116).
 */
export function vehicleOfTarget(target: Entity): Entity | undefined {
  if (isVehicleEntity(target.typeId)) return target;
  if (!isStandInEntity(target.typeId)) return undefined;
  const owner = ownerOf(target);
  const vehicle = owner ? world.getEntity(owner) : undefined;
  return vehicle?.isValid && isVehicleEntity(vehicle.typeId)
    ? vehicle
    : undefined;
}

/**
 * Removes a stand-in that loads without its vehicle loaded near it, or whose vehicle names
 * another stand-in. A vehicle that loads a tick later gets a new stand-in on its first
 * drive tick.
 */
export function removeOrphanStandIn(standIn: Entity): void {
  if (!standIn.isValid || !isStandInEntity(standIn.typeId)) return;
  const owner = ownerOf(standIn);
  const vehicle = standIn.dimension
    .getEntities({ location: standIn.location, maxDistance: SEARCH_RADIUS })
    .find((entity) => entity.id === owner && isVehicleEntity(entity.typeId));
  if (vehicle?.getDynamicProperty(STAND_IN_PROPERTY) !== standIn.id)
    standIn.remove();
}

export class StandIns {
  /** The stand-in entity id of each vehicle kept this session. */
  private readonly kept = new Map<VehicleId, string>();
  /** Vehicles whose other stand-ins were looked for since they were last seen. */
  private readonly swept = new Set<VehicleId>();

  keep(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    pose: StandInPose | undefined,
  ): void {
    const savedId = vehicle?.isValid
      ? vehicle.getDynamicProperty(STAND_IN_PROPERTY)
      : undefined;
    let standIn = standInEntity(
      this.kept.get(vehicleId) ??
        (typeof savedId === "string" ? savedId : undefined),
      vehicleId,
    );
    if (!vehicle?.isValid || !pose) {
      standIn?.remove();
      this.forget(vehicleId, vehicle);
      return;
    }
    const type = standInType(pose.name, pose.axis);
    if (
      standIn &&
      (standIn.typeId !== type || standIn.dimension.id !== vehicle.dimension.id)
    ) {
      standIn.remove();
      standIn = undefined;
    }
    if (!this.swept.has(vehicleId)) {
      // After /reload or a restart, or when a stand-in's id was not saved before the
      // world stopped, others of this vehicle may stand nearby.
      this.removeOthers(vehicle, standIn?.id);
      this.swept.add(vehicleId);
    }
    const at = { x: pose.x, y: pose.y, z: pose.z };
    try {
      if (!standIn) {
        standIn = vehicle.dimension.spawnEntity(type, at);
        standIn.setDynamicProperty(STAND_IN_OF_PROPERTY, vehicleId);
      } else if (
        Math.hypot(
          standIn.location.x - at.x,
          standIn.location.y - at.y,
          standIn.location.z - at.z,
        ) > TELEPORT_TOLERANCE
      ) {
        standIn.teleport(at);
      }
    } catch {
      // The spot is in an unloaded chunk; the next tick tries again, and the rest of the
      // vehicle's tick goes on.
      if (!standIn) return;
    }
    // The stand-in offers a seat only so a phone shows the interact button; every
    // interaction is cancelled and passed to the vehicle (ADR 0116).
    standIn.getComponent("minecraft:rideable")?.ejectRiders();
    this.kept.set(vehicleId, standIn.id);
    if (savedId !== standIn.id)
      vehicle.setDynamicProperty(STAND_IN_PROPERTY, standIn.id);
  }

  private removeOthers(vehicle: Entity, keepId: string | undefined): void {
    for (const other of vehicle.dimension.getEntities({
      families: [STAND_IN_FAMILY],
      location: vehicle.location,
      maxDistance: SEARCH_RADIUS,
    }))
      if (other.id !== keepId && ownerOf(other) === vehicle.id) other.remove();
  }

  private forget(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    this.kept.delete(vehicleId);
    this.swept.delete(vehicleId);
    if (vehicle?.isValid && vehicle.getDynamicProperty(STAND_IN_PROPERTY))
      vehicle.setDynamicProperty(STAND_IN_PROPERTY, undefined);
  }

  /**
   * Removes the stand-ins of vehicles that are not loaded: those kept this session, and any
   * other loaded stand-in, such as one whose vehicle was removed while the script was
   * reloading, which no load event reports again.
   */
  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const id of [...this.kept.keys()])
      if (!live.has(id)) this.keep(id, undefined, undefined);
    for (const id of [...this.swept]) if (!live.has(id)) this.swept.delete(id);
    for (const dimId of DIMENSIONS)
      for (const standIn of world
        .getDimension(dimId)
        .getEntities({ families: [STAND_IN_FAMILY] })) {
        const owner = ownerOf(standIn);
        if (owner === undefined || !live.has(owner as VehicleId))
          standIn.remove();
      }
  }
}
