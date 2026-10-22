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

/** Seats `player` in `vehicle`, taking them off any other mount first and back onto it when the vehicle refuses them. */
function board(
  rideable: EntityRideableComponent,
  vehicle: Entity,
  player: Player,
): boolean {
  if (!canBoard(player, vehicle)) return false;
  const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  const other = mount && mount.id !== vehicle.id ? mount : undefined;
  other?.getComponent("minecraft:rideable")?.ejectRider(player);
  if (rideable.addRider(player)) return true;
  other?.getComponent("minecraft:rideable")?.addRider(player);
  return false;
}

/** Seats `spare`, or a new filler, in the vehicle's next seat; a filler that cannot get in is removed. */
function holdSeat(
  rideable: EntityRideableComponent,
  vehicle: Entity,
  spare: Entity | undefined,
): void {
  let filler = spare;
  try {
    filler ??= vehicle.dimension.spawnEntity(
      SEAT_FILLER_TYPE,
      vehicle.location,
    );
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

export class SeatFillers {
  /** The filler ids each vehicle had after its last layout, to remove when it is gone. */
  private readonly kept = new Map<VehicleId, readonly string[]>();

  /**
   * Makes the vehicle's rider list `layout`. The riders from the first one out of place
   * get off and back on in order, since the engine only adds riders at the end; a player
   * who cannot get in is replaced by a filler, so the riders after them keep their seats.
   * A filler that cannot get in is skipped, and the riders after it still get back on.
   */
  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    layout: SeatAssignment,
    playerOf: (id: PlayerId) => Player | undefined,
  ): void {
    const rideable = vehicle?.getComponent("minecraft:rideable");
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
      const spare = moved.filter(isFiller);
      for (const want of layout.slice(same)) {
        const player = want === undefined ? undefined : playerOf(want);
        if (player && board(rideable, vehicle, player)) continue;
        // A filler that cannot spawn or get in is skipped, so the players after it still get
        // back on, one seat lower until the next layout, instead of staying ejected.
        holdSeat(rideable, vehicle, spare.pop());
      }
      for (const filler of spare) filler.remove();
    }
    this.remember(vehicleId, rideable.getRiders());
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
  }

  /** Removes the fillers of vehicles that were laid before and are not loaded now. */
  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const id of [...this.kept.keys()]) if (!live.has(id)) this.release(id);
  }
}
