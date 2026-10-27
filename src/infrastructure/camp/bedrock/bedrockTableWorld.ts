import { ItemStack, world } from "@minecraft/server";
import type { TableWorld } from "../../../application/camp/ports/table";
import type { TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  CAMP_TABLE_ITEM,
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_ON_TOP_HINT,
  TABLE_HITS_LEFT_HINT,
} from "../identifiers";
import { takenTableSpots } from "./tableOvens";

function tableOf(id: TableId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === CAMP_TABLE_TYPE
    ? entity
    : undefined;
}

function blockAt(dimensionId: DimensionId, at: Vec3) {
  try {
    return world.getDimension(dimensionId).getBlock(at);
  } catch {
    return undefined;
  }
}

export class BedrockTableWorld implements TableWorld {
  constructor(
    private readonly vehicles: {
      isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
    },
  ) {}

  isAir(dimensionId: DimensionId, at: Vec3): boolean {
    return blockAt(dimensionId, at)?.isAir === true;
  }

  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean {
    return (
      blockAt(dimensionId, at)?.typeId.startsWith(`${NAMESPACE}:`) === true
    );
  }

  isVehicleSpace(dimensionId: DimensionId, at: Vec3): boolean {
    return this.vehicles.isVehicleSpace(dimensionId, at);
  }

  hasTableNear(dimensionId: DimensionId, at: Vec3): boolean {
    return (
      world.getDimension(dimensionId).getEntities({
        type: CAMP_TABLE_TYPE,
        location: at,
        maxDistance: 1.75,
      }).length > 0
    );
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerById(playerId));
  }

  consumeItem(playerId: PlayerId, slot: number): boolean {
    const player = playerById(playerId);
    return player !== undefined && consumeHeld(player, CAMP_TABLE_ITEM, slot);
  }

  spawnTable(dimensionId: DimensionId, at: Vec3, yaw: number): void {
    const table = world
      .getDimension(dimensionId)
      .spawnEntity(CAMP_TABLE_TYPE, at);
    table.setRotation({ x: 0, y: yaw });
  }

  ovensOnTable(id: TableId): number {
    return takenTableSpots(id).size;
  }

  showOvenOnTop(player: PlayerId): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: DUTCH_OVEN_ON_TOP_HINT,
    });
  }

  isOccupied(tableId: TableId): boolean {
    return (
      (tableOf(tableId)?.getComponent("minecraft:rideable")?.getRiders()
        .length ?? 0) > 0
    );
  }

  dropItem(tableId: TableId): void {
    const table = tableOf(tableId);
    table?.dimension.spawnItem(
      new ItemStack(CAMP_TABLE_ITEM, 1),
      table.location,
    );
  }

  removeTable(tableId: TableId): void {
    tableOf(tableId)?.remove();
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    playerById(playerId)?.onScreenDisplay.setActionBar({
      translate: TABLE_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
