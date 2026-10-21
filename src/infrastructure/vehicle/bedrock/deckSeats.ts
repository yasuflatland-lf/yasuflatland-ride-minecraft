// Persistent auxiliary seats for held vehicles (ADR 0063).
import {
  type Dimension,
  type Entity,
  type Player,
  world,
} from "@minecraft/server";
import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { DeckSeatSpot } from "../../../domain/vehicle/dock/dock";
import { DECK_SEAT_REACH } from "../../../domain/vehicle/kinds/index";
import { isLightBlock } from "./headlightBlocks";
import {
  DECK_SEAT_COMPACT_EVENT,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  isVehicleEntity,
  PLAYER_TYPE,
} from "./identifiers";

// Under a pixel (1/16 block): a seat this close to its spot is left alone, so a
// seated player is not teleported every tick for drift nobody can see.
const TELEPORT_TOLERANCE = 0.05;
// A deck seat stays within TELEPORT_TOLERANCE of its spot, at most
// DECK_SEAT_REACH from its vehicle; the margin finds a loaded owner even
// when the seat loads a tick before the owner has been moved back to its
// hold pose.
const ORPHAN_MARGIN = 5;
const ORPHAN_RADIUS = DECK_SEAT_REACH + ORPHAN_MARGIN;

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

function seatEntity(
  id: string | null | undefined,
  vehicleId: string,
): Entity | undefined {
  const seat = id ? world.getEntity(id) : undefined;
  return seat?.isValid &&
    seat.typeId === DECK_SEAT_TYPE &&
    seat.getDynamicProperty(DECK_SEAT_OF_PROPERTY) === vehicleId
    ? seat
    : undefined;
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

// The feet and head cells must be open, so a block a player put in the aisle
// leaves the engine's dismount spot instead of trapping the rider in it (ADR 0109).
function standClear(dimension: Dimension, at: Vec3): boolean {
  const feet = { x: at.x, y: Math.floor(at.y), z: at.z };
  return [feet, { ...feet, y: feet.y + 1 }].every((cell) => {
    try {
      const block = dimension.getBlock(cell);
      return block !== undefined && (block.isAir || isLightBlock(block));
    } catch {
      return false; // Unloaded chunk or outside the world
    }
  });
}

/**
 * Moves a player who rode `seat` when the deck seats were last kept, and now
 * rides nothing, to `at`, keeping their view (ADR 0109). A player boarded into the
 * vehicle or onto another seat still rides something and is left alone.
 */
function standUp(seated: Seated, seat: Entity, at: Vec3): void {
  const { player } = seated;
  if (
    !player.isValid ||
    player.dimension.id !== seat.dimension.id ||
    player.getComponent("minecraft:riding") ||
    !standClear(seat.dimension, at)
  )
    return;
  player.teleport(at, { rotation: player.getRotation() });
}

export function removeOrphanDeckSeat(seat: Entity): void {
  if (!seat.isValid || seat.typeId !== DECK_SEAT_TYPE) return;
  const owner = seat.getDynamicProperty(DECK_SEAT_OF_PROPERTY);
  const found = seat.dimension
    .getEntities({ location: seat.location, maxDistance: ORPHAN_RADIUS })
    .some((entity) => entity.id === owner && isVehicleEntity(entity.typeId));
  if (!found) seat.remove();
}

export class DeckSeats {
  private readonly kept = new Map<VehicleId, (string | null)[]>();
  // Script memory only: after a /reload nobody is known to have been seated, so
  // the first tick moves nobody (ADR 0109).
  private readonly seated = new Map<VehicleId, (Seated | undefined)[]>();

  private ids(vehicle: Entity): (string | null)[] {
    const id = asVehicleId(vehicle.id);
    const seatIds = this.kept.get(id) ?? savedIds(vehicle);
    this.kept.set(id, seatIds);
    return seatIds;
  }

  keep(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    positions: readonly (DeckSeatSpot | undefined)[],
    yaw: number,
  ): void {
    const ids = vehicle ? this.ids(vehicle) : (this.kept.get(vehicleId) ?? []);
    const before = JSON.stringify(ids);
    const wanted = vehicle ? positions : [];
    const wasSeated = this.seated.get(vehicleId) ?? [];
    for (let index = 0; index < Math.max(ids.length, wanted.length); index++) {
      let seat = seatEntity(ids[index], vehicleId);
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
        standUp(was, seat, at.stand);
      if (seat && seat.dimension.id !== vehicle.dimension.id) {
        seat.remove();
        seat = undefined;
      }
      if (!seat) {
        seat = vehicle.dimension.spawnEntity(DECK_SEAT_TYPE, {
          x: at.x,
          y: at.y,
          z: at.z,
        });
        seat.setDynamicProperty(DECK_SEAT_OF_PROPERTY, vehicleId);
        seat.setRotation({ x: 0, y: yaw });
        if (at.compact) seat.triggerEvent(DECK_SEAT_COMPACT_EVENT);
        ids[index] = seat.id;
      } else if (
        Math.hypot(
          seat.location.x - at.x,
          seat.location.y - at.y,
          seat.location.z - at.z,
        ) > TELEPORT_TOLERANCE
      ) {
        seat.teleport(
          { x: at.x, y: at.y, z: at.z },
          { rotation: { x: 0, y: yaw } },
        );
      }
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
      const seat = seatEntity(id, vehicleId);
      const player = seatedPlayer(seat);
      return seat && player ? { seatId: seat.id, player } : undefined;
    });
    if (seated.some((s) => s !== undefined)) this.seated.set(vehicleId, seated);
    else this.seated.delete(vehicleId);
  }

  riders(vehicle: Entity): (Player | undefined)[] {
    return this.ids(vehicle).map((id) =>
      seatedPlayer(seatEntity(id, vehicle.id)),
    );
  }

  board(vehicle: Entity): void {
    const rideable = vehicle.getComponent("minecraft:rideable");
    if (!rideable) return;
    for (const id of this.ids(vehicle)) {
      const seat = seatEntity(id, vehicle.id);
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
      const seat = seatEntity(id, vehicle.id);
      const player = seatedPlayer(seat);
      if (!seat || !player) continue;
      seat.getComponent("minecraft:rideable")?.ejectRider(player);
      players.push(player);
    }
    return players;
  }

  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const id of this.kept.keys())
      if (!live.has(id)) this.keep(id, undefined, [], 0);
  }
}
