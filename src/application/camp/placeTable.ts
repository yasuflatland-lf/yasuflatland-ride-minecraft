import { TABLE_SPEC } from "../../domain/camp/spec";
import { tableCells, tableYaw } from "../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop } from "./groundPlacement";
import type { TableWorld } from "./ports/table";

export interface PlaceTableCommand {
  playerId: PlayerId;
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
    const yaw = tableYaw(cmd.yaw);
    const cells = tableCells(cmd.blockLocation, yaw);
    for (const cell of cells) {
      if (this.world.isOwnBlock(cmd.dimensionId, cell)) return false;
      for (let dy = 1; dy <= TABLE_SPEC.clearance; dy++) {
        const above = { ...cell, y: cell.y + dy };
        if (
          !this.world.isAir(cmd.dimensionId, above) ||
          this.world.isVehicleSpace(cmd.dimensionId, above)
        )
          return false;
      }
    }
    const at = {
      x: cmd.blockLocation.x + (Math.abs(yaw) % 180 === 0 ? 1 : 0.5),
      y: cmd.blockLocation.y + 1,
      z: cmd.blockLocation.z + (Math.abs(yaw) % 180 === 0 ? 0.5 : 1),
    };
    if (this.world.hasTableNear(cmd.dimensionId, at)) return false;
    if (
      !this.world.isCreative(cmd.playerId) &&
      !this.world.consumeItem(cmd.playerId, cmd.slot)
    )
      return false;
    this.world.spawnTable(cmd.dimensionId, at, yaw);
    return true;
  }
}
