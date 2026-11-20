// Persistent auxiliary seats for held vehicles (ADR 0063).
import { type Entity, type Player, world } from "@minecraft/server";
import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";
import type { DeckSeatSpot } from "../../../domain/vehicle/dock/dock";
import { DECK_SEAT_REACH } from "../../../domain/vehicle/kinds/index";
import { mountOf } from "../../shared/mount";
import {
  DECK_SEAT_COMPACT_EVENT,
  DECK_SEAT_DRIVER_EVENT,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  isVehicleEntity,
  PLAYER_TYPE,
} from "./identifiers";
import {
  loadedOwnerNear,
  type OwnedEntityKind,
  ownedEntity,
  ownerIdOf,
  type PerVehicleState,
  placeOwned,
} from "./ownedEntities";
import { openCellSpot, standUp } from "./standUp";

// A deck seat stays within TELEPORT_TOLERANCE of its spot, at most
// DECK_SEAT_REACH from its vehicle; the margin finds a loaded owner even
// when the seat loads a tick before the owner moves back to its hold pose.
const ORPHAN_MARGIN = 5;
const DECK_SEAT_KIND: OwnedEntityKind = {
  ownerProperty: DECK_SEAT_OF_PROPERTY,
  isType: (typeId) => typeId === DECK_SEAT_TYPE,
  searchRadius: DECK_SEAT_REACH + ORPHAN_MARGIN,
};

function savedIds(vehicle: Entity): (string | null)[] {
  const raw = vehicle.getDynamicProperty(DECK_SEATS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((id) => (typeof id === "string" ? id : null))
      : [];
  } catch {
    return [];
  }
}

function seatedPlayer(seat: Entity | undefined): Player | undefined {
  return seat
    ?.getComponent("minecraft:rideable")
    ?.getRiders()
    .find((rider): rider is Player => rider.typeId === PLAYER_TYPE);
}

/** The player a deck seat held when the deck seats were last kept. */
interface Seated {
  readonly seatId: string;
  readonly player: Player;
}

export function removeOrphanDeckSeat(seat: Entity): void {
  if (!seat.isValid || seat.typeId !== DECK_SEAT_TYPE) return;
  if (!loadedOwnerNear(seat, DECK_SEAT_KIND)) seat.remove();
}

/** The vehicle and seat index of a player riding one of its parked deck seats. */
export function deckSeatRide(
  player: Player,
): { vehicle: Entity; seat: number } | undefined {
  const mount = mountOf(player);
  if (!mount?.isValid || mount.typeId !== DECK_SEAT_TYPE) return undefined;
  const owner = ownerIdOf(mount, DECK_SEAT_KIND);
  if (owner === undefined) return undefined;
  const vehicle = world.getEntity(owner);
  if (!vehicle?.isValid || !isVehicleEntity(vehicle.typeId)) return undefined;
  const seat = savedIds(vehicle).indexOf(mount.id);
  return seat < 0 ? undefined : { vehicle, seat };
}

export class DeckSeats implements PerVehicleState {
  constructor(
    private readonly isStandableRoomBlock: (typeId: string) => boolean,
  ) {}

  private readonly kept = new Map<VehicleId, (string | null)[]>();
  // Script memory only: after a /reload nobody is known to have been seated, so
  // the first tick moves nobody (ADR 0109).
  private readonly seated = new Map<VehicleId, (Seated | undefined)[]>();

  private ids(vehicle: Entity): (string | null)[] {
    return this.kept.get(asVehicleId(vehicle.id)) ?? savedIds(vehicle);
  }

  keep(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    positions: readonly (DeckSeatSpot | undefined)[],
    yaw: number,
  ): void {
    const ids = vehicle ? this.ids(vehicle) : (this.kept.get(vehicleId) ?? []);
    if (vehicle) this.kept.set(vehicleId, ids);
    const before = JSON.stringify(ids);
    const wanted = vehicle ? positions : [];
    const wasSeated = this.seated.get(vehicleId) ?? [];
    for (let index = 0; index < Math.max(ids.length, wanted.length); index++) {
      const seat = ownedEntity(ids[index], vehicleId, DECK_SEAT_KIND);
      const at = wanted[index];
      if (!at || !vehicle) {
        seat?.remove();
        ids[index] = null;
        continue;
      }
      // Only a seat that is kept counts: departure and a taken vehicle seat
      // remove theirs, and their riders keep the engine's dismount (ADR 0109).
      const was = wasSeated[index];
      if (seat && at.stand && was?.seatId === seat.id)
        standUp(was.player, seat, at.stand, (dimension, at) =>
          openCellSpot(dimension, at, this.isStandableRoomBlock),
        );
      const rotation = { x: 0, y: yaw };
      const placed = placeOwned(
        seat,
        vehicle,
        { x: at.x, y: at.y, z: at.z },
        (dimension, spot) => {
          const spawned = dimension.spawnEntity(DECK_SEAT_TYPE, spot);
          spawned.setDynamicProperty(DECK_SEAT_OF_PROPERTY, vehicleId);
          try {
            spawned.setRotation(rotation);
            if (at.compact) spawned.triggerEvent(DECK_SEAT_COMPACT_EVENT);
            if (at.driver) spawned.triggerEvent(DECK_SEAT_DRIVER_EVENT);
          } catch {
            // A chunk can unload after spawning. Keep the owned seat's id for the next tick.
          }
          return spawned;
        },
        { rotation },
      );
      ids[index] = placed?.id ?? (seat?.isValid ? seat.id : null);
    }
    ids.length = wanted.length;
    if (ids.length > 0) this.kept.set(vehicleId, ids);
    else this.kept.delete(vehicleId);
    this.remember(vehicleId, ids);
    if (vehicle?.isValid && JSON.stringify(ids) !== before)
      vehicle.setDynamicProperty(
        DECK_SEATS_PROPERTY,
        ids.length > 0 ? JSON.stringify(ids) : undefined,
      );
  }

  private remember(
    vehicleId: VehicleId,
    ids: readonly (string | null)[],
  ): void {
    const seated = ids.map((id): Seated | undefined => {
      const seat = ownedEntity(id, vehicleId, DECK_SEAT_KIND);
      const player = seatedPlayer(seat);
      return seat && player ? { seatId: seat.id, player } : undefined;
    });
    if (seated.some((s) => s !== undefined)) this.seated.set(vehicleId, seated);
    else this.seated.delete(vehicleId);
  }

  riders(vehicle: Entity): (Player | undefined)[] {
    return this.ids(vehicle).map((id) =>
      seatedPlayer(ownedEntity(id, vehicle.id, DECK_SEAT_KIND)),
    );
  }

  board(vehicle: Entity): void {
    const rideable = vehicle.getComponent("minecraft:rideable");
    if (!rideable) return;
    for (const id of this.ids(vehicle)) {
      const seat = ownedEntity(id, vehicle.id, DECK_SEAT_KIND);
      const seatRideable = seat?.getComponent("minecraft:rideable");
      const player = seatedPlayer(seat);
      if (!player || !seatRideable) continue;
      seatRideable.ejectRider(player);
      if (!rideable.addRider(player)) seatRideable.addRider(player);
    }
  }

  /** Takes every player off this vehicle's deck seats and returns them in seat order (ADR 0095). */
  eject(vehicle: Entity): Player[] {
    const players: Player[] = [];
    for (const id of this.ids(vehicle)) {
      const seat = ownedEntity(id, vehicle.id, DECK_SEAT_KIND);
      const player = seatedPlayer(seat);
      if (!seat || !player) continue;
      seat.getComponent("minecraft:rideable")?.ejectRider(player);
      players.push(player);
    }
    return players;
  }

  release(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    this.keep(vehicleId, vehicle, [], 0);
  }

  sweepGone(live: ReadonlySet<VehicleId>): void {
    for (const id of this.kept.keys())
      if (!live.has(id)) this.release(id, undefined);
  }
}
