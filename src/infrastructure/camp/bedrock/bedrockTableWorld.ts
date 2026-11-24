import { world } from "@minecraft/server";
import type { TableWorld } from "../../../application/camp/ports/table";
import { TABLE_SPEC } from "../../../domain/camp/spec";
import { asTableId, type TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  entityOfType,
  hasEntityNear,
  spawnWithRollback,
} from "../../shared/entities";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
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
      hasEntityNear(dimensionId, CAMP_TABLE_TYPE, at, TABLE_SPEC.spacing) ??
      true
    );
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

  dropItem(tableId: TableId, hitter?: PlayerId): void {
    const table = tableOf(tableId);
    if (table)
      giveBack(
        table,
        CAMP_TABLE_ITEM,
        giveBackReceiver(TABLE_SPEC.giveBack, hitter),
      );
  }

  removeTable(tableId: TableId): void {
    tableOf(tableId)?.remove();
  }

  showHitsLeft(playerId: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(playerId, TABLE_HITS_LEFT_HINT, hitsLeft);
  }
}
