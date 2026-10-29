// Implements the ports with @minecraft/server (ADR 0012).
import {
  ButtonState,
  type Entity,
  EntityDamageCause,
  InputButton,
  type Player,
  world,
} from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type {
  DriveWorld,
  VehicleSnapshot,
} from "../../../application/vehicle/ports/drive";
import {
  asPlayerId,
  asVehicleId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { CutColumn } from "../../../domain/vehicle/cut";
import {
  type ClearCell,
  type DeckSeatSpot,
  type Departure,
  DOCK_RESTORED,
  inBox,
} from "../../../domain/vehicle/dock/dock";
import type { DockCell, HoldPose } from "../../../domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import { VEHICLE_KINDS } from "../../../domain/vehicle/kind";
import {
  entityContractOf,
  profileOf,
  RAM_QUERY_RADIUS,
} from "../../../domain/vehicle/kinds/index";
import type { LitCell } from "../../../domain/vehicle/lighting/headlights";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { SeatAssignment } from "../../../domain/vehicle/seatChoice";
import type { StandInPose } from "../../../domain/vehicle/standIn";
import type { RiderView } from "../../../domain/vehicle/vehicle";
import { heldTypeId } from "../../shared/heldItem";
import { AIR_BLOCK, messageKey } from "../../shared/identifiers";
import { isLightBlock } from "../../shared/lightBlocks";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { savedDecor } from "./bedrockDecorWorld";
import { BladeCuts } from "./bladeCuts";
import { DeckSeats } from "./deckSeats";
import { DockBlocks, savedDock } from "./dockBlocks";
import {
  type EntityIndex,
  isPlayer,
  loadedVehicleEntities,
} from "./entityIndex";
import { HeadlightBlocks } from "./headlightBlocks";
import { riderHeldOf } from "./heldBlock";
import {
  CHASE_CAMERAS,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
  HEADLIGHTS_PROPERTY,
  kindOfEntity,
  ramMountOf,
  VEHICLE_FAMILY,
} from "./identifiers";
import { seatExitSpot } from "./seatExitSpot";
import { SeatFillers } from "./seatFillers";
import { StandIns } from "./standIns";
import { standUp } from "./standUp";
import { systemClock } from "./systemClock";
import { VehicleReleaser } from "./vehicleReleaser";
import { isLavaAt, isWaterAt } from "./water";

function rawInputOf(player: Player): RawInput {
  const movement = player.inputInfo.getMovementVector();
  return {
    moveX: movement.x,
    moveY: movement.y,
    jump:
      player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed,
  };
}

function offsetFrom(vehicle: Entity, offset: Vec3): Vec3 {
  return {
    x: vehicle.location.x + offset.x,
    y: vehicle.location.y + offset.y,
    z: vehicle.location.z + offset.z,
  };
}

// How far from a cell's middle a vehicle can stand and still reach into the cell: the
// largest footprint plus the cell's half diagonal, and the tallest clearance (ADR 0122).
const SPACE_QUERY_RADIUS = Math.max(
  ...VEHICLE_KINDS.map((kind) => {
    const { footprint, placement } = profileOf(kind);
    return Math.hypot(footprint + 1, placement.clearance.height + 1);
  }),
);

/** How far `cell`'s ground square lies from `point` across the ground. */
function groundGap(cell: Vec3, point: Vec3): number {
  const dx = Math.max(cell.x - point.x, 0, point.x - (cell.x + 1));
  const dz = Math.max(cell.z - point.z, 0, point.z - (cell.z + 1));
  return Math.hypot(dx, dz);
}

function distanceSq(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

export class BedrockVehicleWorld implements DriveWorld {
  private readonly headlightBlocks: HeadlightBlocks;
  private readonly bladeCuts = new BladeCuts(systemClock);
  private readonly deckSeats = new DeckSeats();
  private readonly standIns = new StandIns();
  private readonly seatFillers = new SeatFillers();
  private readonly dockBlocks: DockBlocks;
  private readonly holds = new Map<VehicleId, HoldPose>();
  /** Shared with BedrockFleetWorld so a removed vehicle releases the same blocks, seats, stand-in and hold. */
  readonly releaser: VehicleReleaser;

  constructor(
    private readonly index: EntityIndex,
    private readonly testInputs: VehicleTestStore<RawInput>,
    private readonly testHeldItems: VehicleTestStore<string>,
    campSpace: SpaceCheck,
  ) {
    this.headlightBlocks = new HeadlightBlocks(campSpace);
    this.dockBlocks = new DockBlocks(campSpace);
    this.releaser = new VehicleReleaser(
      this.headlightBlocks,
      this.dockBlocks,
      this.deckSeats,
      this.standIns,
      this.holds,
      this.seatFillers,
    );
  }

  /** The vehicle whose laid room door is at this cell, if any (ADR 0068). */
  dockDoorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.doorOwner(dimensionId, cell);
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  dockCellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.cellOwner(dimensionId, cell);
  }

  /** The vehicle whose laid dock block this is, while the world still holds it (ADR 0096). */
  dockBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.dockBlocks.laidBlockOwner(dimensionId, cell, typeId);
  }

  /**
   * Whether a vehicle laid a room block in `cell` or in the block under it, or a
   * loaded vehicle's footprint, turned to any heading, reaches into `cell` at a height
   * within its kind's placement clearance (ADR 0122).
   */
  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean {
    const below = { x: cell.x, y: cell.y - 1, z: cell.z };
    if (
      this.dockCellOwner(dimensionId, cell) !== undefined ||
      this.dockCellOwner(dimensionId, below) !== undefined
    )
      return true;
    const middle = { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
    let near: Entity[];
    try {
      near = world.getDimension(dimensionId).getEntities({
        families: [VEHICLE_FAMILY],
        location: middle,
        maxDistance: SPACE_QUERY_RADIUS,
      });
    } catch {
      return false; // Unknown dimension id
    }
    return near.some((vehicle) => {
      const kind = kindOfEntity(vehicle.typeId);
      if (kind === undefined) return false;
      const { footprint, placement } = profileOf(kind);
      const dy = cell.y - Math.floor(vehicle.location.y);
      return (
        dy >= 0 &&
        dy <= placement.clearance.height &&
        groundGap(cell, vehicle.location) < footprint
      );
    });
  }

  loadedVehicles(): VehicleSnapshot[] {
    this.index.clear();
    const snapshots: VehicleSnapshot[] = [];
    for (const vehicle of loadedVehicleEntities()) {
      const kind = kindOfEntity(vehicle.typeId);
      if (kind === undefined) continue;
      const id = asVehicleId(vehicle.id);
      this.index.track(vehicle);
      const v = vehicle.getVelocity();
      const deckRiders = this.deckSeats.riders(vehicle);
      snapshots.push({
        id,
        kind,
        location: vehicle.location,
        yaw: vehicle.getRotation().y,
        velocity: v,
        onGround: vehicle.isOnGround,
        riders: this.riders(vehicle, profileOf(kind).monitor !== undefined),
        deckSeatInputs: deckRiders.map((player) =>
          player ? rawInputOf(player) : undefined,
        ),
        deckSeatRiders: deckRiders.map((player) =>
          player ? asPlayerId(player.id) : undefined,
        ),
        restored: () => {
          const dock = savedDock(vehicle);
          return {
            [DOCK_RESTORED.laid]: dock.laid,
            [DOCK_RESTORED.doorOpen]: dock.doorOpen,
            [DOCK_RESTORED.decor]: savedDecor(vehicle),
            ...Object.fromEntries(
              entityContractOf(kind).restored.map((name) => [
                name,
                vehicle.getProperty(entityPropertyId(name)),
              ]),
            ),
          };
        },
        headlights: vehicle.getProperty(HEADLIGHTS_PROPERTY) === true,
        testInput: this.testInputs.get(id),
        testHeld: riderHeldOf(this.testHeldItems.get(id)),
      });
    }
    const live = this.index.trackedIds();
    this.testInputs.retain(live);
    this.testHeldItems.retain(live);
    this.headlightBlocks.clearGone(live);
    this.dockBlocks.clearGone(live);
    this.deckSeats.clearGone(live);
    this.standIns.clearGone(live);
    this.seatFillers.clearGone(live);
    for (const id of this.holds.keys())
      if (!live.has(id)) this.holds.delete(id);
    return snapshots;
  }

  private riders(vehicle: Entity, readHeld: boolean): RiderView[] {
    // The engine seats riders by their index in this list (ADR 0019), seat fillers
    // included (ADR 0120), so the index is taken before the players are picked out.
    const aboard = (
      vehicle.getComponent("minecraft:rideable")?.getRiders() ?? []
    )
      .map((rider, slot) => ({ rider, slot }))
      .filter((entry): entry is { rider: Player; slot: number } =>
        isPlayer(entry.rider),
      );
    // A player the seat layout took off a tick ago is still riding it, in the slot
    // they wait for (ADR 0120), unless they got on something else meanwhile.
    for (const [id, slot] of this.seatFillers.waitingRiders(
      asVehicleId(vehicle.id),
    )) {
      const player = this.index.player(id);
      if (
        player?.isValid &&
        !player.getComponent("minecraft:riding") &&
        !aboard.some((entry) => entry.rider.id === id)
      )
        aboard.push({ rider: player, slot });
    }
    return aboard
      .sort((a, b) => a.slot - b.slot)
      .map(({ rider: p, slot }) => {
        return {
          slot,
          id: asPlayerId(p.id),
          offset: {
            x: p.location.x - vehicle.location.x,
            z: p.location.z - vehicle.location.z,
          },
          yaw: p.getRotation().y,
          raw: rawInputOf(p),
          held: readHeld ? riderHeldOf(heldTypeId(p)) : undefined,
        };
      });
  }

  waterAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    return isWaterAt(vehicle.dimension, offsetFrom(vehicle, offset));
  }

  lavaAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    return isLavaAt(vehicle.dimension, offsetFrom(vehicle, offset));
  }

  solidAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    try {
      const at = offsetFrom(vehicle, offset);
      const b = vehicle.dimension.getBlock(at);
      if (!b || b.isAir || b.isLiquid || isLightBlock(b)) return false;
      // A ray that starts inside a block finds nothing, so a cell under
      // another block counts as solid without one.
      const above = b.above();
      if (above && !above.isAir && !above.isLiquid) return true;
      // Flowers, grass, carpets and torches have no collision box: a ray cast
      // down from just above the cell passes through them (ADR 0035).
      const hit = vehicle.dimension.getBlockFromRay(
        { x: at.x, y: b.location.y + 1.001, z: at.z },
        { x: 0, y: -1, z: 0 },
        {
          includePassableBlocks: false,
          includeLiquidBlocks: false,
          maxDistance: 1,
        },
      );
      return hit?.block.location.y === b.location.y;
    } catch {
      return false; // Unloaded chunk or outside the world
    }
  }

  blockTypes(
    vehicleId: VehicleId,
    cells: readonly Vec3[],
  ): (string | undefined)[] {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return cells.map(() => undefined);
    return cells.map((c) => {
      try {
        const b = vehicle.dimension.getBlock(c);
        if (!b) return undefined;
        return b.isAir || isLightBlock(b) ? AIR_BLOCK : b.typeId;
      } catch {
        return undefined; // Unloaded chunk or outside the world
      }
    });
  }

  clearBlocks(vehicleId: VehicleId, cells: readonly ClearCell[]): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    for (const c of cells) {
      try {
        const b = vehicle.dimension.getBlock(c);
        // A block placed since the check belongs to a player.
        if (b?.typeId === c.typeId) b.setType(AIR_BLOCK);
      } catch {
        // Unloaded chunk: the dock then skips the cell, as it skips any non-air cell.
      }
    }
  }

  cutColumns(vehicleId: VehicleId, columns: readonly CutColumn[]): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) this.bladeCuts.cut(vehicle.dimension, columns);
  }

  sweepCutDrop(entity: Entity): boolean {
    return this.bladeCuts.sweepDrop(entity);
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.index.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }

  seatStandingPlayers(vehicleId: VehicleId, departure: Departure): void {
    const vehicle = this.index.entity(vehicleId);
    const rideable = vehicle?.getComponent("minecraft:rideable");
    if (!vehicle || !rideable) return;
    // Boarding already ran this tick, so a player still on a deck seat was refused
    // a seat; the deck seats go next, so they leave like a standing player (ADR 0095).
    const refused = this.deckSeats.eject(vehicle);
    // A rider the seat layout took off this tick is seated again next tick; the
    // engine refuses addRider in the tick of the ejection and the exit would
    // throw them out of the camper (ADR 0154).
    const refusedIds = new Set(refused.map((p) => p.id));
    const reseated = this.seatFillers.waitingRiders(vehicleId);
    const standing = vehicle.dimension
      .getPlayers()
      .filter(
        (p) =>
          !refusedIds.has(p.id) &&
          !reseated.has(asPlayerId(p.id)) &&
          !p.getComponent("minecraft:riding") &&
          departure.boxes.some((box) => inBox(box, p.location)),
      )
      .sort(
        (a, b) =>
          distanceSq(a.location, vehicle.location) -
          distanceSq(b.location, vehicle.location),
      );
    for (const p of [...refused, ...standing])
      if (!rideable.addRider(p) && departure.exit)
        p.teleport(departure.exit, {
          rotation: { x: 0, y: departure.exit.yaw },
        });
  }

  targetsNear(vehicleId: VehicleId): RamTarget[] {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return [];
    return vehicle.dimension
      .getEntities({
        location: vehicle.location,
        maxDistance: RAM_QUERY_RADIUS,
        excludeFamilies: ["inanimate"],
        excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
      })
      .filter((e) => e.id !== vehicle.id)
      .map((e) => ({
        id: e.id,
        offset: {
          x: e.location.x - vehicle.location.x,
          y: e.location.y - vehicle.location.y,
          z: e.location.z - vehicle.location.z,
        },
        mount: ramMountOf(
          e.getComponent("minecraft:riding")?.entityRidingOn?.typeId,
        ),
      }));
  }

  holdAt(vehicleId: VehicleId, pose: HoldPose | undefined): void {
    if (!pose) {
      this.holds.delete(vehicleId);
      return;
    }
    this.holds.set(vehicleId, pose);
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.teleport(
      { x: pose.x, y: pose.y, z: pose.z },
      { rotation: { x: 0, y: pose.yaw } },
    );
    vehicle.clearVelocity();
  }

  keepDeckSeats(
    vehicleId: VehicleId,
    positions: readonly (DeckSeatSpot | undefined)[],
    yaw: number,
  ): void {
    this.deckSeats.keep(
      vehicleId,
      this.index.entity(vehicleId),
      positions,
      yaw,
    );
  }

  standRiderAt(vehicleId: VehicleId, playerId: PlayerId, at: Vec3): void {
    const vehicle = this.index.entity(vehicleId);
    const player = this.index.player(playerId);
    if (!vehicle || !player) return;
    standUp(player, vehicle, at, seatExitSpot);
  }

  keepStandIn(vehicleId: VehicleId, pose: StandInPose | undefined): void {
    this.standIns.keep(vehicleId, this.index.entity(vehicleId), pose);
  }

  keepSeatLayout(vehicleId: VehicleId, layout: SeatAssignment): void {
    this.seatFillers.lay(
      vehicleId,
      this.index.entity(vehicleId),
      layout,
      (playerId) => this.index.player(playerId),
    );
  }

  boardDeckRiders(vehicleId: VehicleId): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) this.deckSeats.board(vehicle);
  }

  layDock(vehicleId: VehicleId, cells: readonly DockCell[]): void {
    this.dockBlocks.lay(vehicleId, this.index.entity(vehicleId), cells);
  }

  applyMotion(vehicleId: VehicleId, impulse: Vec3, yaw: number): void {
    if (this.holds.has(vehicleId)) return;
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.applyImpulse(impulse);
    vehicle.setRotation({ x: 0, y: yaw });
  }

  run(vehicleId: VehicleId, commands: readonly EngineCommand[]): void {
    const entity = this.index.entity(vehicleId);
    if (!entity) return;
    for (const command of commands) {
      switch (command.type) {
        case "setProperty":
          entity.setProperty(entityPropertyId(command.name), command.value);
          break;
        case "triggerEvent":
          entity.triggerEvent(entityEventId(command.name));
          break;
        case "playAnimation":
          entity.playAnimation(entityAnimationId(entity.typeId, command.name));
          break;
        case "playSound":
          entity.dimension.playSound(command.name, entity.location);
          break;
        default: {
          const unknown: never = command;
          throw new Error(`Unknown engine command: ${JSON.stringify(unknown)}`);
        }
      }
    }
  }

  setChaseCamera(playerId: PlayerId, chase: ChaseCamera | undefined): void {
    const camera = this.index.player(playerId)?.camera;
    if (!camera) return;
    if (chase) camera.setCamera(CHASE_CAMERAS[chase]);
    else camera.clear();
  }

  giveWaterBreathing(playerId: PlayerId, ticks: number): void {
    this.index.player(playerId)?.addEffect("water_breathing", ticks, {
      showParticles: false,
    });
  }

  protectFromFire(playerId: PlayerId): void {
    const player = this.index.player(playerId);
    if (!player) return;
    player.addEffect("fire_resistance", 2, { showParticles: false });
    player.extinguishFire(false);
  }

  damage(hit: RamHit, attackerId: PlayerId | undefined): void {
    const target = world.getEntity(hit.id);
    if (!target?.isValid) return;
    const attacker = attackerId ? world.getEntity(attackerId) : undefined;
    target.applyDamage(hit.damage, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: attacker,
    });
    target.applyKnockback({ x: hit.push.x, z: hit.push.z }, hit.pushUp);
  }

  shineHeadlights(vehicleId: VehicleId, cells: readonly LitCell[]): void {
    this.headlightBlocks.shine(vehicleId, this.index.entity(vehicleId), cells);
  }

  releaseVehicle(vehicleId: VehicleId): void {
    this.releaser.release(vehicleId, this.index.entity(vehicleId));
  }
}
