// Every block carrying componentId is a bed its feature laid, so the tap needs no owner lookup (ADR 0092).
import { system } from "@minecraft/server";
import type { SleepInBed } from "../../application/shared/sleepInBed";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";

// A custom component id registers only once at startup, so each feature passes its own.
export function registerBedBlock(componentId: string, bed: SleepInBed): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(componentId, {
      onPlayerInteract: (ev) => {
        if (!ev.player) return;
        bed.execute({
          playerId: asPlayerId(ev.player.id),
          dimensionId: asDimensionId(ev.dimension.id),
          cell: ev.block.location,
        });
      },
    });
  });
}
