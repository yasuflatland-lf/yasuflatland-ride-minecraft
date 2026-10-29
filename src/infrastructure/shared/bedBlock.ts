// A feature may pass spawnCellFor to look up the owner and its spawn cell; the tent passes none (ADR 0092, 0133, 0182).
import { system } from "@minecraft/server";
import type { SleepInBed } from "../../application/shared/sleepInBed";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
} from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";

// A custom component id registers only once at startup, so each feature passes its own.
export function registerBedBlock(
  componentId: string,
  bed: SleepInBed,
  spawnCellFor: (dimensionId: DimensionId, cell: Vec3) => Vec3 | undefined = (
    _dimensionId,
    cell,
  ) => cell,
): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(componentId, {
      onPlayerInteract: (ev) => {
        if (!ev.player) return;
        const dimensionId = asDimensionId(ev.dimension.id);
        bed.execute({
          playerId: asPlayerId(ev.player.id),
          dimensionId,
          cell:
            spawnCellFor(dimensionId, ev.block.location) ?? ev.block.location,
        });
      },
    });
  });
}
