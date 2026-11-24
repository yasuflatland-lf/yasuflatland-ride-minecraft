import { TABLE_SPEC } from "../../domain/camp/spec";
import {
  tableClearCells,
  tableOrigin,
  tableYaw,
} from "../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnCells } from "../shared/groundPlacement";
import type { TableWorld } from "./ports/table";

interface PlaceTableCommand {
  playerId?: PlayerId;
  dimensionId: DimensionId;
  blockLocation: Vec3;
  yaw: number;
  slot: number;
}

export class PlaceTable {
  constructor(private readonly world: TableWorld) {}

  canUseBlock(dimensionId: DimensionId, block: Vec3, face: string): boolean {
    return canUseBlockTop(this.world, dimensionId, block, face);
  }

  execute(cmd: PlaceTableCommand): boolean {
    const world = this.world;
    const { dimensionId: dimension, blockLocation: block } = cmd;
    const yaw = tableYaw(cmd.yaw);
    const at = tableOrigin(block, yaw);
    return placeOnCells(
      {
        dimension,
        payment: world,
        cells: {
          // The own-block check precedes the air check in each column.
          isAir: (d, cell) =>
            (cell.y !== at.y ||
              !world.isOwnBlock(d, { ...cell, y: block.y })) &&
            world.isAir(d, cell),
          isCampSpace: world.isCampSpace?.bind(world),
          isVehicleSpace: (d, cell) => world.isVehicleSpace(d, cell),
        },
      },
      {
        support: [],
        clear: tableClearCells(block, yaw),
        refuses: TABLE_SPEC.refuses,
        extraCheck: () => !world.hasTableNear(dimension, at),
      },
      { player: cmd.playerId, slot: cmd.slot },
      () => world.spawnTable(dimension, at, yaw),
    ).placed;
  }
}
