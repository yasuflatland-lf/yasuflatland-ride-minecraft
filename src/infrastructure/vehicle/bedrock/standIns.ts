// The stand-in entities that take a vehicle's hits and interactions where its own
// hitboxes cannot follow its heading, such as the camper's bumper (ADR 0116).
import { type Entity, world } from "@minecraft/server";
import type { VehicleId } from "../../../domain/shared/ids";
import { STAND_IN_REACH } from "../../../domain/vehicle/kinds/index";
import type { StandInPose } from "../../../domain/vehicle/standIn";
import { allDimensions } from "../../shared/dimensions";
import {
  isStandInEntity,
  isVehicleEntity,
  STAND_IN_FAMILY,
  STAND_IN_OF_PROPERTY,
  STAND_IN_PROPERTY,
  standInType,
} from "./identifiers";
import {
  loadedOwnerNear,
  type OwnedEntityKind,
  ownedEntity,
  ownerIdOf,
  type PerVehicleState,
  placeOwned,
} from "./ownedEntities";
import { vehicleOfSeatFiller } from "./seatFillers";

// A driving stand-in trails its vehicle by one tick's move, up to about 1.3 blocks on
// default ground (ADR 0067); the margin finds a loaded owner, or another stand-in of the
// same vehicle, past that.
const SEARCH_MARGIN = 5;
const STAND_IN_KIND: OwnedEntityKind = {
  ownerProperty: STAND_IN_OF_PROPERTY,
  isType: isStandInEntity,
  searchRadius: STAND_IN_REACH + SEARCH_MARGIN,
};

// Entity loads already check for orphans (handlers/fleet.ts), so scanning for strays
// that were already loaded can wait about a second between sweeps.
const STRAY_STAND_IN_SCAN_SWEEPS = 20;

/**
 * The vehicle an entity a player hit or used stands for: the vehicle itself, the vehicle a
 * seat filler rides (ADR 0120), or the loaded vehicle a stand-in belongs to; undefined for
 * anything else (ADR 0116).
 */
export function vehicleOfTarget(target: Entity): Entity | undefined {
  if (isVehicleEntity(target.typeId)) return target;
  const filled = vehicleOfSeatFiller(target);
  if (filled) return filled;
  if (!isStandInEntity(target.typeId)) return undefined;
  const owner = ownerIdOf(target, STAND_IN_KIND);
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
  const vehicle = loadedOwnerNear(standIn, STAND_IN_KIND);
  if (vehicle?.getDynamicProperty(STAND_IN_PROPERTY) !== standIn.id)
    standIn.remove();
}

export class StandIns implements PerVehicleState {
  /** The stand-in entity id of each vehicle kept this session. */
  private readonly kept = new Map<VehicleId, string>();
  /** Vehicles whose other stand-ins were looked for since they were last seen. */
  private readonly swept = new Set<VehicleId>();
  private sweepsUntilStrayScan = 0;

  keep(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    pose: StandInPose | undefined,
  ): void {
    const savedId = vehicle?.isValid
      ? vehicle.getDynamicProperty(STAND_IN_PROPERTY)
      : undefined;
    let existing = ownedEntity(
      this.kept.get(vehicleId) ??
        (typeof savedId === "string" ? savedId : undefined),
      vehicleId,
      STAND_IN_KIND,
    );
    if (!vehicle?.isValid || !pose) {
      existing?.remove();
      this.forget(vehicleId, vehicle);
      return;
    }
    const type = standInType(pose.name, pose.axis);
    if (existing && existing.typeId !== type) {
      existing.remove();
      existing = undefined;
    }
    if (!this.swept.has(vehicleId)) {
      // After /reload or a restart, or when a stand-in's id was not saved before the
      // world stopped, others of this vehicle may stand nearby.
      this.removeOthers(vehicle, existing?.id);
      this.swept.add(vehicleId);
    }
    const placed = placeOwned(
      existing,
      vehicle,
      { x: pose.x, y: pose.y, z: pose.z },
      (dimension, at) => {
        const spawned = dimension.spawnEntity(type, at);
        spawned.setDynamicProperty(STAND_IN_OF_PROPERTY, vehicleId);
        return spawned;
      },
    );
    const standIn = placed ?? (existing?.isValid ? existing : undefined);
    if (!standIn) return;
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
      maxDistance: STAND_IN_KIND.searchRadius,
    }))
      if (other.id !== keepId && ownerIdOf(other, STAND_IN_KIND) === vehicle.id)
        other.remove();
  }

  private forget(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    this.kept.delete(vehicleId);
    this.swept.delete(vehicleId);
    if (vehicle?.isValid && vehicle.getDynamicProperty(STAND_IN_PROPERTY))
      vehicle.setDynamicProperty(STAND_IN_PROPERTY, undefined);
  }

  release(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    this.keep(vehicleId, vehicle, undefined);
  }

  sweepGone(live: ReadonlySet<VehicleId>): void {
    for (const id of this.kept.keys())
      if (!live.has(id)) this.release(id, undefined);
    for (const id of this.swept) if (!live.has(id)) this.swept.delete(id);

    if (this.sweepsUntilStrayScan > 0) {
      this.sweepsUntilStrayScan--;
      return;
    }
    this.sweepsUntilStrayScan = STRAY_STAND_IN_SCAN_SWEEPS - 1;
    this.removeStrays(live);
  }

  /** Covers already-loaded stand-ins left behind while the script was offline. */
  private removeStrays(live: ReadonlySet<VehicleId>): void {
    for (const dimension of allDimensions())
      for (const standIn of dimension.getEntities({
        families: [STAND_IN_FAMILY],
      })) {
        const owner = ownerIdOf(standIn, STAND_IN_KIND);
        if (owner === undefined || !live.has(owner as VehicleId))
          standIn.remove();
      }
  }
}
