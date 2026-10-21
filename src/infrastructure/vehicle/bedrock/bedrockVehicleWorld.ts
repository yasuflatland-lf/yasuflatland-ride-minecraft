// Implements the ports with @minecraft/server (ADR 0012).
import {
  ButtonState,
  type Entity,
  EntityDamageCause,
  InputButton,
  type Player,
  world,
} from "@minecraft/server";
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
import {
  type ClearCell,
  type Departure,
  DOCK_RESTORED,
  inBox,
} from "../../../domain/vehicle/dock/dock";
import type { DockCell, HoldPose } from "../../../domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import {
  entityContractOf,
  RAM_QUERY_RADIUS,
} from "../../../domain/vehicle/kinds/index";
import type { Cell } from "../../../domain/vehicle/lighting/headlights";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { RiderView } from "../../../domain/vehicle/vehicle";
import type { TestInputStore } from "../testInput/testInputStore";
import { savedDecor } from "./bedrockDecorWorld";
import { DeckSeats } from "./deckSeats";
import { DockBlocks, savedDock } from "./dockBlocks";
import { DIMENSIONS, type EntityIndex, isPlayer } from "./entityIndex";
import { HeadlightBlocks, isLightBlock } from "./headlightBlocks";
import {
  AIR_BLOCK,
  CHASE_CAMERAS,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
  HEADLIGHTS_PROPERTY,
  kindOfEntity,
  messageKey,
  ramMountOf,
  VEHICLE_FAMILY,
} from "./identifiers";
import { VehicleReleaser } from "./vehicleReleaser";
import { isWaterAt } from "./water";

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

function distanceSq(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

export class BedrockVehicleWorld implements DriveWorld {
  private readonly headlightBlocks = new HeadlightBlocks();
  private readonly deckSeats = new DeckSeats();
  private readonly dockBlocks = new DockBlocks();
  private readonly holds = new Map<VehicleId, HoldPose>();
  /** Shared with BedrockFleetWorld so a removed vehicle releases the same blocks, seats and hold. */
  readonly releaser = new VehicleReleaser(
    this.headlightBlocks,
    this.dockBlocks,
    this.deckSeats,
    this.holds,
  );

  constructor(
    private readonly index: EntityIndex,
    private readonly testInputs: TestInputStore,
  ) {}

  /** The vehicle whose laid room door is at this cell, if any (ADR 0068). */
  dockDoorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.doorOwner(dimensionId, cell);
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  dockCellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.cellOwner(dimensionId, cell);
  }

  loadedVehicles(): VehicleSnapshot[] {
    this.index.clear();
    const snapshots: VehicleSnapshot[] = [];
    for (const dimId of DIMENSIONS) {
      for (const vehicle of world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })) {
        const kind = kindOfEntity(vehicle.typeId);
        if (kind === undefined) continue;
        const id = asVehicleId(vehicle.id);
        this.index.track(vehicle);
        const v = vehicle.getVelocity();
        snapshots.push({
          id,
          kind,
          location: vehicle.location,
          yaw: vehicle.getRotation().y,
          velocity: v,
          onGround: vehicle.isOnGround,
          riders: this.riders(vehicle),
          deckSeatInputs: this.deckSeats
            .riders(vehicle)
            .map((player) => (player ? rawInputOf(player) : undefined)),
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
        });
      }
    }
    const live = this.index.trackedIds();
    this.testInputs.retain(live);
    this.headlightBlocks.clearGone(live);
    this.dockBlocks.clearGone(live);
    this.deckSeats.clearGone(live);
    for (const id of this.holds.keys())
      if (!live.has(id)) this.holds.delete(id);
    return snapshots;
  }

  private riders(vehicle: Entity): RiderView[] {
    return (vehicle.getComponent("minecraft:rideable")?.getRiders() ?? [])
      .filter(isPlayer)
      .map((p) => {
        return {
          id: asPlayerId(p.id),
          offset: {
            x: p.location.x - vehicle.location.x,
            z: p.location.z - vehicle.location.z,
          },
          yaw: p.getRotation().y,
          raw: rawInputOf(p),
        };
      });
  }

  waterAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    return isWaterAt(vehicle.dimension, offsetFrom(vehicle, offset));
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

  showMessage(playerId: PlayerId, name: string): void {
    this.index.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }

  seatStandingPlayers(vehicleId: VehicleId, departure: Departure): void {
    const vehicle = this.index.entity(vehicleId);
    const rideable = vehicle?.getComponent("minecraft:rideable");
    if (!vehicle || !rideable) return;
    const standing = vehicle.dimension
      .getPlayers()
      .filter(
        (p) =>
          !p.getComponent("minecraft:riding") &&
          departure.boxes.some((box) => inBox(box, p.location)),
      )
      .sort(
        (a, b) =>
          distanceSq(a.location, vehicle.location) -
          distanceSq(b.location, vehicle.location),
      );
    for (const p of standing)
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
    positions: readonly (Vec3 | undefined)[],
    yaw: number,
  ): void {
    this.deckSeats.keep(
      vehicleId,
      this.index.entity(vehicleId),
      positions,
      yaw,
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

  shineHeadlights(vehicleId: VehicleId, cells: readonly Cell[]): void {
    this.headlightBlocks.shine(vehicleId, this.index.entity(vehicleId), cells);
  }

  releaseVehicle(vehicleId: VehicleId): void {
    this.releaser.release(vehicleId, this.index.entity(vehicleId));
  }
}
