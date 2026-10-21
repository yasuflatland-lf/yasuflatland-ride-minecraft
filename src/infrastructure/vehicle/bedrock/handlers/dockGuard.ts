import { world } from "@minecraft/server";
import {
  asDimensionId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";

export function registerDockGuard(
  dockBlockOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => VehicleId | undefined,
): void {
  // destructible_by_mining: false does not stop a Creative player, who breaks any
  // block at once, so breaks of a held vehicle's laid blocks are cancelled here (ADR 0096).
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const { block } = ev;
    if (
      dockBlockOwner(
        asDimensionId(ev.dimension.id),
        block.location,
        block.typeId,
      ) !== undefined
    )
      ev.cancel = true;
  });
}
