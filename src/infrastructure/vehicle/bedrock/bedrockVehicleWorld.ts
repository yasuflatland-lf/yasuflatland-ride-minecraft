// Implements the ports with @minecraft/server (ADR 0012).
import {
  ButtonState,
  type Entity,
  EntityDamageCause,
  InputButton,
  ItemStack,
  type Player,
  world,
} from "@minecraft/server";
import type {
  BreakWorld,
  DriveWorld,
  LimitWorld,
  VehicleSnapshot,
} from "../../../application/vehicle/ports";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  type ClearCell,
  type Departure,
  DOCK_RESTORED,
  inBox,
} from "../../../domain/vehicle/dock";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import type { FleetEntry } from "../../../domain/vehicle/fleet";
import type { DockCell, HoldPose } from "../../../domain/vehicle/floor";
import type { Cell } from "../../../domain/vehicle/headlights";
import {
  entityContractOf,
  RAM_QUERY_RADIUS,
} from "../../../domain/vehicle/kinds/index";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { RiderView } from "../../../domain/vehicle/vehicle";
import type { TestInputStore } from "../testInput/testInputStore";
import { DeckSeats } from "./deckSeats";
import { DockBlocks, savedDock } from "./dockBlocks";
import { type EntityIndex, isPlayer } from "./entityIndex";
import { HeadlightBlocks, isLightBlock } from "./headlightBlocks";
import {
  AIR_BLOCK,
  CHASE_CAMERAS,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
  fleetEntryOf,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  isVehicleEntity,
  kindOfEntity,
  messageKey,
  VEHICLE_FAMILY,
} from "./identifiers";
import { isWaterAt } from "./water";

const DIMENSIONS = ["overworld", "nether", "the_end"] as const;

function rawInputOf(player: Player): RawInput {
  const movement = player.inputInfo.getMovementVector();
  return {
    moveX: movement.x,
    moveY: movement.y,
    jump:
      player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed,
  };
}

function offsetFrom(car: Entity, offset: Vec3): Vec3 {
  return {
    x: car.location.x + offset.x,
    y: car.location.y + offset.y,
    z: car.location.z + offset.z,
  };
}

function distanceSq(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

export class BedrockVehicleWorld implements DriveWorld, BreakWorld, LimitWorld {
  private readonly headlightBlocks = new HeadlightBlocks();
  private readonly deckSeats = new DeckSeats();
  private readonly dockBlocks = new DockBlocks();
  private readonly holds = new Map<string, HoldPose>();

  constructor(
    private readonly index: EntityIndex,
    private readonly testInputs: TestInputStore,
  ) {}

  /** The vehicle whose laid room door is at this cell, if any (ADR 0068). */
  dockDoorOwner(dimensionId: string, cell: Vec3): string | undefined {
    return this.dockBlocks.doorOwner(dimensionId, cell);
  }

  loadedFleetEntries(): FleetEntry[] {
    return DIMENSIONS.flatMap((dimId) =>
      world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })
        .map(fleetEntryOf)
        .filter((entry) => entry !== undefined),
    );
  }

  loadedVehicles(): VehicleSnapshot[] {
    this.index.clear();
    const snapshots: VehicleSnapshot[] = [];
    for (const dimId of DIMENSIONS) {
      for (const car of world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })) {
        const kind = kindOfEntity(car.typeId);
        if (kind === undefined) continue;
        this.index.track(car);
        const v = car.getVelocity();
        snapshots.push({
          id: car.id,
          kind,
          location: car.location,
          yaw: car.getRotation().y,
          velocity: v,
          onGround: car.isOnGround,
          riders: this.riders(car),
          deckSeatInputs: this.deckSeats
            .riders(car)
            .map((player) => (player ? rawInputOf(player) : undefined)),
          restored: () => {
            const dock = savedDock(car);
            return {
              [DOCK_RESTORED.laid]: dock.laid,
              [DOCK_RESTORED.doorOpen]: dock.doorOpen,
              ...Object.fromEntries(
                entityContractOf(kind).restored.map((name) => [
                  name,
                  car.getProperty(entityPropertyId(name)),
                ]),
              ),
            };
          },
          headlights: car.getProperty(HEADLIGHTS_PROPERTY) === true,
          testInput: this.testInputs.get(car.id),
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

  private riders(car: Entity): RiderView[] {
    return (car.getComponent("minecraft:rideable")?.getRiders() ?? [])
      .filter(isPlayer)
      .map((p) => {
        return {
          id: p.id,
          offset: {
            x: p.location.x - car.location.x,
            z: p.location.z - car.location.z,
          },
          yaw: p.getRotation().y,
          raw: rawInputOf(p),
        };
      });
  }

  waterAt(vehicleId: string, offset: Vec3): boolean {
    const car = this.index.entity(vehicleId);
    if (!car) return false;
    return isWaterAt(car.dimension, offsetFrom(car, offset));
  }

  solidAt(vehicleId: string, offset: Vec3): boolean {
    const car = this.index.entity(vehicleId);
    if (!car) return false;
    try {
      const at = offsetFrom(car, offset);
      const b = car.dimension.getBlock(at);
      if (!b || b.isAir || b.isLiquid || isLightBlock(b)) return false;
      // A ray that starts inside a block finds nothing, so a cell under
      // another block counts as solid without one.
      const above = b.above();
      if (above && !above.isAir && !above.isLiquid) return true;
      // Flowers, grass, carpets and torches have no collision box: a ray cast
      // down from just above the cell passes through them (ADR 0035).
      const hit = car.dimension.getBlockFromRay(
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
    vehicleId: string,
    cells: readonly Vec3[],
  ): (string | undefined)[] {
    const car = this.index.entity(vehicleId);
    if (!car) return cells.map(() => undefined);
    return cells.map((c) => {
      try {
        const b = car.dimension.getBlock(c);
        if (!b) return undefined;
        return b.isAir || isLightBlock(b) ? AIR_BLOCK : b.typeId;
      } catch {
        return undefined; // Unloaded chunk or outside the world
      }
    });
  }

  clearBlocks(vehicleId: string, cells: readonly ClearCell[]): void {
    const car = this.index.entity(vehicleId);
    if (!car) return;
    for (const c of cells) {
      try {
        const b = car.dimension.getBlock(c);
        // A block placed since the check belongs to a player.
        if (b?.typeId === c.typeId) b.setType(AIR_BLOCK);
      } catch {
        // Unloaded chunk: the dock then skips the cell, as it skips any non-air cell.
      }
    }
  }

  showMessage(playerId: string, name: string): void {
    this.index.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }

  seatStandingPlayers(vehicleId: string, departure: Departure): void {
    const car = this.index.entity(vehicleId);
    const rideable = car?.getComponent("minecraft:rideable");
    if (!car || !rideable) return;
    const standing = car.dimension
      .getPlayers()
      .filter(
        (p) =>
          !p.getComponent("minecraft:riding") &&
          departure.boxes.some((box) => inBox(box, p.location)),
      )
      .sort(
        (a, b) =>
          distanceSq(a.location, car.location) -
          distanceSq(b.location, car.location),
      );
    for (const p of standing)
      if (!rideable.addRider(p) && departure.exit)
        p.teleport(departure.exit, {
          rotation: { x: 0, y: departure.exit.yaw },
        });
  }

  targetsNear(vehicleId: string): RamTarget[] {
    const car = this.index.entity(vehicleId);
    if (!car) return [];
    return car.dimension
      .getEntities({
        location: car.location,
        maxDistance: RAM_QUERY_RADIUS,
        excludeFamilies: ["inanimate"],
        excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
      })
      .filter((e) => e.id !== car.id)
      .map((e) => ({
        id: e.id,
        offset: {
          x: e.location.x - car.location.x,
          y: e.location.y - car.location.y,
          z: e.location.z - car.location.z,
        },
        protectedOccupant: isVehicleEntity(
          e.getComponent("minecraft:riding")?.entityRidingOn?.typeId,
        ),
      }));
  }

  holdAt(vehicleId: string, pose: HoldPose | undefined): void {
    if (!pose) {
      this.holds.delete(vehicleId);
      return;
    }
    this.holds.set(vehicleId, pose);
    const car = this.index.entity(vehicleId);
    if (!car) return;
    car.teleport(
      { x: pose.x, y: pose.y, z: pose.z },
      { rotation: { x: 0, y: pose.yaw } },
    );
    car.clearVelocity();
  }

  keepDeckSeats(
    vehicleId: string,
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

  boardDeckRiders(vehicleId: string): void {
    const car = this.index.entity(vehicleId);
    if (car) this.deckSeats.board(car);
  }

  layDock(vehicleId: string, cells: readonly DockCell[]): void {
    this.dockBlocks.lay(vehicleId, this.index.entity(vehicleId), cells);
  }

  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void {
    if (this.holds.has(vehicleId)) return;
    const car = this.index.entity(vehicleId);
    if (!car) return;
    car.applyImpulse(impulse);
    car.setRotation({ x: 0, y: yaw });
  }

  run(vehicleId: string, commands: readonly EngineCommand[]): void {
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

  setChaseCamera(playerId: string, chase: ChaseCamera | undefined): void {
    const camera = this.index.player(playerId)?.camera;
    if (!camera) return;
    if (chase) camera.setCamera(CHASE_CAMERAS[chase]);
    else camera.clear();
  }

  giveWaterBreathing(playerId: string, ticks: number): void {
    this.index.player(playerId)?.addEffect("water_breathing", ticks, {
      showParticles: false,
    });
  }

  damage(hit: RamHit, attackerId: string | undefined): void {
    const target = world.getEntity(hit.id);
    if (!target?.isValid) return;
    const attacker = attackerId ? world.getEntity(attackerId) : undefined;
    target.applyDamage(hit.damage, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: attacker,
    });
    target.applyKnockback({ x: hit.push.x, z: hit.push.z }, hit.pushUp);
  }

  dropVehicleItem(vehicleId: string): void {
    const car = this.index.entity(vehicleId);
    if (!car) return;
    const kind = kindOfEntity(car.typeId);
    if (kind === undefined) return;
    car.dimension.spawnItem(new ItemStack(ITEM_TYPE[kind], 1), car.location);
  }

  removeVehicle(vehicleId: string): void {
    const car = this.index.entity(vehicleId);
    this.headlightBlocks.shine(vehicleId, car, []);
    this.dockBlocks.lay(vehicleId, car, []);
    this.deckSeats.keep(vehicleId, car, [], 0);
    this.holds.delete(vehicleId);
    car?.remove();
  }

  shineHeadlights(vehicleId: string, cells: readonly Cell[]): void {
    this.headlightBlocks.shine(vehicleId, this.index.entity(vehicleId), cells);
  }
}
