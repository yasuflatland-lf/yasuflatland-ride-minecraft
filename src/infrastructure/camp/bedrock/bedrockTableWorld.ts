import { ItemStack, world } from "@minecraft/server";
import type { TableWorld } from "../../../application/camp/ports/table";
import type { TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { entityOfType } from "../../shared/entities";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import { showActionBar, showHitsLeftHint } from "../../shared/players";
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

export class BedrockTableWorld
  extends BedrockPaidGroundCells
  implements TableWorld
{
  constructor(
    private readonly vehicles: {
      topHosts: TopHostRegistry;
      isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
    },
  ) {
    super(
      (dimension, cell) => vehicles.isVehicleSpace(dimension, cell),
      CAMP_TABLE_ITEM,
    );
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

  spawnTable(dimensionId: DimensionId, at: Vec3, yaw: number): void {
    const table = world
      .getDimension(dimensionId)
      .spawnEntity(CAMP_TABLE_TYPE, at);
    table.setRotation({ x: 0, y: yaw });
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
