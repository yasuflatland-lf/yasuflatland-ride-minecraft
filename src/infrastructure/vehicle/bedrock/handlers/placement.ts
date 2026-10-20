// Places a vehicle from its item: the block interaction for land and for the
// bed or shore of water, and the itemUse view ray for open water (ADR 0024, 0051).
import {
  type Block,
  type Dimension,
  Direction,
  type Player,
  system,
  world,
} from "@minecraft/server";
import type {
  PlaceVehicle,
  PlaceVehicleCommand,
} from "../../../../application/vehicle/placeVehicle";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import type { Vec3 } from "../../../../domain/shared/vec";
import type { VehicleKind } from "../../../../domain/vehicle/kind";
import type { BlockFace } from "../../../../domain/vehicle/placement/placement";
import { kindOfItem } from "../identifiers";
import { isWaterAt } from "../water";

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

export function registerPlacement(placeVehicle: PlaceVehicle): void {
  // One tap on water can fire both the block interaction and itemUse, in the
  // same tick, so each player gets one placement request and one placement per
  // tick. The deferred placement runs a tick later, where it can meet an itemUse.
  const requested = oncePerPlayerPerTick();
  const placed = oncePerPlayerPerTick();
  const place = (cmd: PlaceVehicleCommand) => {
    if (placed(cmd.playerId)) placeVehicle.execute(cmd);
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
    slot: player.selectedSlotIndex,
  });
  // The interaction ray skips liquids and reports the bed under the water or
  // the shore beside it, so a water kind climbs to the top water cell of the
  // clicked or the adjacent cell (docs/spike-sportsboat.md).
  const cellFor = (kind: VehicleKind, block: Block, face: Direction) =>
    placeVehicle.cellFor(
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

  // A tap on open water past the interaction reach fires only itemUse. This ray
  // sees liquids, but only a water hit places a vehicle: land placement goes
  // through the block interaction above, which keeps the normal reach.
  // The headlight switch has its own itemUse subscriber; no item passes both.
  world.afterEvents.itemUse.subscribe((ev) => {
    const kind = kindOfItem(ev.itemStack.typeId);
    if (kind === undefined || !placeVehicle.placesOnWater(kind)) return;
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
  });
}

/** Returns true for the first call per player in a game tick. */
function oncePerPlayerPerTick(): (playerId: string) => boolean {
  const seen = new TickScopedSet<string>();
  return (playerId) => seen.add(system.currentTick, playerId);
}
