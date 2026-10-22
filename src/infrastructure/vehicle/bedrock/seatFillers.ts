// Lays a vehicle's riders in the order that puts each player in their chosen seat, with
// invisible seat fillers in the free seats below a taken one (ADR 0120).
import type {
  Entity,
  EntityRideableComponent,
  Player,
} from "@minecraft/server";
import { world } from "@minecraft/server";
import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { SeatAssignment } from "../../../domain/vehicle/seatChoice";
import { isVehicleEntity, SEAT_FILLER_TYPE } from "./identifiers";

// A player boards on the tick after their press, so they stand within the engine's
// interaction reach of the vehicle as it was, and the vehicle moves at most about one
// block a tick (ADR 0051). Farther means they left by other means and are not pulled in.
const BOARD_REACH = 8;

// How many layouts in a row a player taken off to lay the riders again may wait to get
// back on before their seat goes to a filler. The engine refuses them in the tick they
// got off (ADR 0120); the margin covers a slower release.
const WAIT_TICKS = 5;

const isFiller = (entity: Entity): boolean =>
  entity.typeId === SEAT_FILLER_TYPE;

function fits(rider: Entity, want: PlayerId | undefined): boolean {
  return want === undefined ? isFiller(rider) : rider.id === want;
}

function canBoard(player: Player, vehicle: Entity): boolean {
  return (
    player.isValid &&
    player.dimension.id === vehicle.dimension.id &&
    (player.getComponent("minecraft:health")?.currentValue ?? 1) > 0 &&
    Math.hypot(
      player.location.x - vehicle.location.x,
      player.location.y - vehicle.location.y,
      player.location.z - vehicle.location.z,
    ) <= BOARD_REACH
  );
}

/**
 * Seats `player` in `vehicle`, taking them off any other mount first and back onto it when
 * the vehicle refuses them. A full vehicle is not tried, since the other mount may not take
 * them back in the tick they got off it.
 */
function board(
  rideable: EntityRideableComponent,
  vehicle: Entity,
  player: Player,
): boolean {
  if (!canBoard(player, vehicle)) return false;
  if (rideable.getRiders().length >= rideable.seatCount) return false;
  const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  const other = mount && mount.id !== vehicle.id ? mount : undefined;
  other?.getComponent("minecraft:rideable")?.ejectRider(player);
  if (rideable.addRider(player)) return true;
  other?.getComponent("minecraft:rideable")?.addRider(player);
  return false;
}

/** Seats a new filler in the vehicle's next seat; a filler that cannot get in is removed. */
function holdSeat(rideable: EntityRideableComponent, vehicle: Entity): void {
  let filler: Entity | undefined;
  try {
    filler = vehicle.dimension.spawnEntity(SEAT_FILLER_TYPE, vehicle.location);
    if (rideable.addRider(filler)) return;
  } catch {
    // Spawning fails where the world refuses it, such as an unloaded chunk.
  }
  if (filler?.isValid) filler.remove();
}

/**
 * Removes a seat filler that loads without riding a vehicle, such as one left by a vehicle
 * that broke while unloaded. One whose vehicle loads later is replaced on its next tick.
 */
export function removeOrphanSeatFiller(entity: Entity): void {
  if (!entity.isValid || !isFiller(entity)) return;
  const mount = entity.getComponent("minecraft:riding")?.entityRidingOn;
  if (!mount || !isVehicleEntity(mount.typeId)) entity.remove();
}

/** The vehicle a seat filler holds a seat in, so a press or a hit on it counts as one on the vehicle. */
export function vehicleOfSeatFiller(entity: Entity): Entity | undefined {
  if (!isFiller(entity)) return undefined;
  const mount = entity.getComponent("minecraft:riding")?.entityRidingOn;
  return mount?.isValid && isVehicleEntity(mount.typeId) ? mount : undefined;
}

/** A player taken off the vehicle to lay its riders again, and the rider-list index they wait for. */
interface Waiting {
  readonly slot: number;
  /** The layouts in a row that this player has waited through, the first one included. */
  readonly ticks: number;
}

export class SeatFillers {
  /** The filler ids each vehicle had after its last layout, to remove when it is gone. */
  private readonly kept = new Map<VehicleId, readonly string[]>();
  /** The players each vehicle's last layout took off and could not put back yet. */
  private readonly waiting = new Map<
    VehicleId,
    ReadonlyMap<PlayerId, Waiting>
  >();

  /**
   * Makes the vehicle's rider list `layout`. The riders from the first one out of place
   * get off, since the engine only adds riders at the end, and the list is added again
   * from there. The engine refuses to add back a rider in the same tick it got off the
   * same vehicle (in-game test `boat_seat_fillers`), so a filler that got off is removed
   * and a new one takes its place, and a player who got off waits: the laying stops at
   * them, and the next layout puts them back on, for up to `WAIT_TICKS` layouts. A
   * player who cannot get in, or waited too long, is replaced by a filler, so the riders
   * after them keep their seats. A filler that cannot get in is skipped, and the riders
   * after it still get back on.
   */
  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    layout: SeatAssignment,
    playerOf: (id: PlayerId) => Player | undefined,
  ): void {
    const rideable = vehicle?.getComponent("minecraft:rideable");
    const before = this.waiting.get(vehicleId);
    this.waiting.delete(vehicleId);
    if (!vehicle || !rideable) return;
    const riders = rideable.getRiders();
    let same = 0;
    while (
      same < riders.length &&
      same < layout.length &&
      fits(riders[same] as Entity, layout[same])
    )
      same++;
    if (same < riders.length || same < layout.length) {
      const moved = riders.slice(same);
      for (const rider of moved) rideable.ejectRider(rider);
      const gotOff = new Set(moved.map((rider) => rider.id));
      for (const rider of moved) if (isFiller(rider)) rider.remove();
      const waiting = new Map<PlayerId, Waiting>();
      for (let index = same; index < layout.length; index++) {
        const want = layout[index];
        const player = want === undefined ? undefined : playerOf(want);
        if (waiting.size === 0) {
          if (!player) {
            holdSeat(rideable, vehicle);
            continue;
          }
          if (!gotOff.has(player.id) && board(rideable, vehicle, player))
            continue;
        }
        // From the first player who waits, everyone after them in the list waits too,
        // since the engine only adds riders at the end.
        const ticks = (want === undefined ? undefined : before?.get(want))
          ?.ticks;
        if (
          want !== undefined &&
          player &&
          (waiting.size > 0 || gotOff.has(player.id) || ticks !== undefined) &&
          (ticks ?? 0) < WAIT_TICKS &&
          canBoard(player, vehicle)
        ) {
          waiting.set(want, { slot: index, ticks: (ticks ?? 0) + 1 });
          continue;
        }
        if (waiting.size === 0) holdSeat(rideable, vehicle);
      }
      if (waiting.size > 0) this.waiting.set(vehicleId, waiting);
    }
    this.remember(vehicleId, rideable.getRiders());
  }

  /**
   * The players the vehicle's last layout took off and is about to put back, by the
   * rider-list index they wait for. They still count as riding it, so their seats are
   * kept for them.
   */
  waitingRiders(vehicleId: VehicleId): ReadonlyMap<PlayerId, number> {
    return new Map(
      [...(this.waiting.get(vehicleId) ?? [])].map(([id, wait]) => [
        id,
        wait.slot,
      ]),
    );
  }

  private remember(vehicleId: VehicleId, riders: readonly Entity[]): void {
    const fillers = riders.filter(isFiller).map((filler) => filler.id);
    if (fillers.length > 0) this.kept.set(vehicleId, fillers);
    else this.kept.delete(vehicleId);
  }

  /** Removes the fillers of a vehicle that is removed or no longer loaded. */
  release(vehicleId: VehicleId): void {
    for (const id of this.kept.get(vehicleId) ?? []) {
      const filler = world.getEntity(id);
      if (filler?.isValid && isFiller(filler)) filler.remove();
    }
    this.kept.delete(vehicleId);
    this.waiting.delete(vehicleId);
  }

  /** Removes the fillers of vehicles that were laid before and are not loaded now. */
  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const id of new Set([...this.kept.keys(), ...this.waiting.keys()]))
      if (!live.has(id)) this.release(id);
  }
}
