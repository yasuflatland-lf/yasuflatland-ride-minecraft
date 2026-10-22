// Implements ChairWorld with @minecraft/server (ADR 0012, 0121).
import { ItemStack, type Player, world } from "@minecraft/server";
import type { ChairWorld } from "../../../application/camp/ports/chair";
import type { ChairId } from "../../../domain/camp/chair";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative } from "../../shared/players";
import { HITS_LEFT_HINT, LOW_CHAIR_ITEM, LOW_CHAIR_TYPE } from "../identifiers";

const PLAYER_TYPE = "minecraft:player";
// From a cell's middle, a chair standing in it is within half a block and one
// in a neighbor cell is a block away.
const SAME_CELL_DISTANCE = 0.75;

function playerOf(playerId: PlayerId): Player | undefined {
  const entity = world.getEntity(playerId);
  return entity?.typeId === PLAYER_TYPE ? (entity as Player) : undefined;
}

function chairOf(chairId: ChairId) {
  const entity = world.getEntity(chairId);
  return entity?.isValid && entity.typeId === LOW_CHAIR_TYPE
    ? entity
    : undefined;
}

function blockAt(dimensionId: DimensionId, at: Vec3) {
  try {
    return world.getDimension(dimensionId).getBlock(at);
  } catch {
    return undefined; // Unknown dimension id, or a cell outside the world
  }
}

export class BedrockChairWorld implements ChairWorld {
  constructor(
    private readonly vehicles: {
      isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
    },
  ) {}

  isAir(dimensionId: DimensionId, at: Vec3): boolean {
    return blockAt(dimensionId, at)?.isAir === true;
  }

  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean {
    return this.vehicles.isVehicleSpace(dimensionId, cell);
  }

  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean {
    return (
      blockAt(dimensionId, at)?.typeId.startsWith(`${NAMESPACE}:`) === true
    );
  }

  hasChairAt(dimensionId: DimensionId, cell: Vec3): boolean {
    try {
      return (
        world.getDimension(dimensionId).getEntities({
          type: LOW_CHAIR_TYPE,
          location: { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
          maxDistance: SAME_CELL_DISTANCE,
        }).length > 0
      );
    } catch {
      return false;
    }
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerOf(playerId));
  }

  consumeChairItem(playerId: PlayerId, slot: number): boolean {
    const player = playerOf(playerId);
    return player !== undefined && consumeHeld(player, LOW_CHAIR_ITEM, slot);
  }

  spawnChair(dimensionId: DimensionId, at: Vec3, yaw: number): void {
    const chair = world
      .getDimension(dimensionId)
      .spawnEntity(LOW_CHAIR_TYPE, at);
    chair.setRotation({ x: 0, y: yaw });
  }

  isOccupied(chairId: ChairId): boolean {
    const riders = chairOf(chairId)
      ?.getComponent("minecraft:rideable")
      ?.getRiders();
    return (riders?.length ?? 0) > 0;
  }

  removeChair(chairId: ChairId): void {
    chairOf(chairId)?.remove();
  }

  dropChairItem(chairId: ChairId): void {
    const chair = chairOf(chairId);
    chair?.dimension.spawnItem(
      new ItemStack(LOW_CHAIR_ITEM, 1),
      chair.location,
    );
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    playerOf(playerId)?.onScreenDisplay.setActionBar({
      translate: HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
