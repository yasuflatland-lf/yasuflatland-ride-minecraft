import { world } from "@minecraft/server";
import type { Cell } from "../../domain/shared/cells";
import { asDimensionId, type DimensionId } from "../../domain/shared/ids";

export function registerLaidBlockGuard(
  owner: (
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ) => string | undefined,
): void {
  // destructible_by_mining: false does not stop a Creative player, who breaks any
  // block at once, so breaks of a holder's laid blocks are cancelled here (ADR 0096).
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const { block } = ev;
    const holderId = owner(
      asDimensionId(ev.dimension.id),
      block.location,
      block.typeId,
    );
    if (holderId !== undefined) ev.cancel = true;
  });
}
