// Connects game events to the use cases.
import {
  type Block,
  type Dimension,
  Direction,
  type Entity,
  GameMode,
  Player,
  system,
  world,
} from "@minecraft/server";
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type {
  PlaceVehicle,
  PlaceVehicleCommand,
} from "../../../application/vehicle/placeVehicle";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { UseDockDoor } from "../../../application/vehicle/useDockDoor";
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { BlockFace } from "../../../domain/vehicle/placement";
import type { TestInputStore } from "../testInput/testInputStore";
import { standsOnDeck } from "./deck";
import { registerDockDoor } from "./handlers/dockDoor";
import { registerDrive } from "./handlers/drive";
import { registerFleet } from "./handlers/fleet";
import { registerStarter } from "./handlers/starter";
import { registerTestInput } from "./handlers/testInput";
import { heldDye } from "./heldDye";
import {
  HEADLIGHT_SWITCH_TYPE,
  isVehicleEntity,
  kindOfItem,
} from "./identifiers";
import { isWaterAt } from "./water";

const BLOCK_FACE: Readonly<Record<Direction, BlockFace>> = {
  [Direction.Up]: "up",
  [Direction.Down]: "down",
  [Direction.North]: "north",
  [Direction.South]: "south",
  [Direction.East]: "east",
  [Direction.West]: "west",
};

// How far the itemUse ray looks for water, in blocks. It reaches open water a
// little past the block interaction; a land hit never places (see itemUse below).
const WATER_RAY_DISTANCE = 12;

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
    starter: GiveStarterVehicle;
    hit: HitVehicle;
    limit: LimitVehicles;
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
    door: UseDockDoor;
    hints: ShowVehicleHints;
  },
  testInputs: TestInputStore,
  dockDoorOwner: (dimensionId: string, cell: Vec3) => string | undefined,
): void {
  registerDockDoor(useCases.door, dockDoorOwner);
  registerDrive(useCases.drive, useCases.hints);
  registerFleet(useCases.limit);
  registerTestInput(testInputs);

  // One tap on water can fire both the block interaction and itemUse, in the
  // same tick, so each player gets one placement request and one placement per
  // tick. The deferred placement runs a tick later, where it can meet an itemUse.
  const requested = oncePerPlayerPerTick();
  const placed = oncePerPlayerPerTick();
  const place = (cmd: PlaceVehicleCommand) => {
    if (placed(cmd.playerId)) useCases.place.execute(cmd);
  };
  const placeCommand = (
    player: Player,
    kind: VehicleKind,
    dimension: Dimension,
    blockLocation: Vec3,
  ): PlaceVehicleCommand => ({
    kind,
    playerId: player.id,
    dimensionId: dimension.id,
    blockLocation,
    yaw: player.getRotation().y,
    creative: player.getGameMode() === GameMode.Creative,
    slot: player.selectedSlotIndex,
  });
  // The interaction ray skips liquids and reports the bed under the water or
  // the shore beside it, so a water kind climbs to the top water cell of the
  // clicked or the adjacent cell (docs/spike-sportsboat.md).
  const cellFor = (kind: VehicleKind, block: Block, face: Direction) =>
    useCases.place.cellFor(
      kind,
      block.dimension.id,
      block.location,
      BLOCK_FACE[face],
    );

  // The after-event only fires when the interaction did something, and an item
  // with no use behavior does nothing on a block, so a tap never reaches it
  // (BDS 1.26.52, mobile; ADR 0024). Before-events cannot change the world, so the
  // placement runs on the next tick. Cancelling keeps the tap from also opening
  // or toggling the block underneath.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const kind = kindOfItem(ev.itemStack?.typeId);
    if (!ev.isFirstEvent || kind === undefined) return;
    const cell = cellFor(kind, ev.block, ev.blockFace);
    if (cell === undefined) return;
    ev.cancel = true;
    if (!requested(ev.player.id)) return;
    const cmd = placeCommand(ev.player, kind, ev.block.dimension, cell);
    system.run(() => place(cmd));
  });

  registerStarter(useCases.starter);

  // Painting listens to hits, not interactions: on touch a short tap on an
  // entity is an attack, and the interaction is left to getting in (ADR 0036).
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!isVehicleEntity(ev.hitEntity.typeId) || !(player instanceof Player))
      return;
    const paint = heldDye(player);
    if (paint) {
      useCases.paint.execute({
        playerId: player.id,
        vehicleId: ev.hitEntity.id,
        paint,
        creative: player.getGameMode() === GameMode.Creative,
        tick: system.currentTick,
      });
      return;
    }
    useCases.hit.execute({
      vehicleId: ev.hitEntity.id,
      tick: system.currentTick,
      fromDeck: standsOnDeck(player),
    });
  });

  const ridden = (player: Entity) => {
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    return isVehicleEntity(mount?.typeId) ? mount : undefined;
  };
  const switchHeadlights = (playerId: string, vehicleId: string) =>
    useCases.headlights.execute({
      playerId,
      vehicleId,
      tick: system.currentTick,
    });

  // A tap on open water past the interaction reach fires only itemUse. This ray
  // sees liquids, but only a water hit places a vehicle: land placement goes
  // through the block interaction above, which keeps the normal reach.
  world.afterEvents.itemUse.subscribe((ev) => {
    const kind = kindOfItem(ev.itemStack.typeId);
    if (kind !== undefined && useCases.place.placesOnWater(kind)) {
      const player = ev.source;
      const hit = player.getBlockFromViewDirection({
        includeLiquidBlocks: true,
        includePassableBlocks: true,
        maxDistance: WATER_RAY_DISTANCE,
      });
      if (!hit || !isWaterAt(hit.block.dimension, hit.block.location)) return;
      const cell = cellFor(kind, hit.block, hit.face);
      if (cell && requested(player.id))
        place(placeCommand(player, kind, hit.block.dimension, cell));
      return;
    }
    if (ev.itemStack.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const car = ridden(ev.source);
    if (car) switchHeadlights(ev.source.id, car.id);
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!isVehicleEntity(ev.target.typeId)) return;
    // A rider aiming at their own vehicle interacts with it instead of using
    // the item, so the switch is handled here too.
    if (
      ev.itemStack?.typeId === HEADLIGHT_SWITCH_TYPE &&
      ridden(ev.player)?.id === ev.target.id
    ) {
      ev.cancel = true;
      const playerId = ev.player.id;
      const vehicleId = ev.target.id;
      system.run(() => switchHeadlights(playerId, vehicleId));
    }
  });
}

/** Returns true for the first call per player in a game tick. */
function oncePerPlayerPerTick(): (playerId: string) => boolean {
  const seen = new Set<string>();
  let tick = -1;
  return (playerId) => {
    if (tick !== system.currentTick) {
      seen.clear();
      tick = system.currentTick;
    }
    if (seen.has(playerId)) return false;
    seen.add(playerId);
    return true;
  };
}
