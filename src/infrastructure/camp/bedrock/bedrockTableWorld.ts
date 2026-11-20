import { ItemStack, world } from "@minecraft/server";
import type { TableWorld } from "../../../application/camp/ports/table";
import { asTableId, type TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { safeBlockAt } from "../../shared/blocks";
import { entityOfType, spawnWithRollback } from "../../shared/entities";
import { NAMESPACE } from "../../shared/identifiers";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
  showActionBar,
  showHitsLeftHint,
} from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  CAMP_TABLE_ITEM,
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_ON_TOP_HINT,
  TABLE_HITS_LEFT_HINT,
} from "../identifiers";

function tableOf(id: TableId) {
  return entityOfType(world, id, CAMP_TABLE_TYPE);
}

function blockAt(dimensionId: DimensionId, at: Vec3) {
  try {
    return safeBlockAt(world.getDimension(dimensionId), at);
  } catch {
    return undefined; // Unknown dimension id
  }
}

export class BedrockTableWorld implements TableWorld {
  constructor(
    private readonly vehicles: {
      topHosts: TopHostRegistry;
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

  refund(player: PlayerId, _slot: number): void {
    const entity = playerById(player);
    if (entity) giveOrDrop(entity, [new ItemStack(CAMP_TABLE_ITEM, 1)]);
  }

  spawnTable(
    dimensionId: DimensionId,
    at: Vec3,
    yaw: number,
  ): TableId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimensionId),
      CAMP_TABLE_TYPE,
      at,
      yaw,
    );
    return entity && asTableId(entity.id);
  }

  itemsOnTable(id: TableId): number {
    return this.vehicles.topHosts.hostedOn("camp_table", id).length;
  }

  showOvenOnTop(player: PlayerId): void {
    showActionBar(player, {
      translate: DUTCH_OVEN_ON_TOP_HINT,
    });
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
    showHitsLeftHint(playerId, TABLE_HITS_LEFT_HINT, hitsLeft);
  }
}
