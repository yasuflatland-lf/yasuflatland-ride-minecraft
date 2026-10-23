import { system } from "@minecraft/server";
import type { SleepInBed } from "../../../../application/shared/sleepInBed";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import { CAMPER_BED_COMPONENT } from "../identifiers";

export function registerDockBed(bed: SleepInBed): void {
  // Every camper_bed block belongs to a laid room, so the tap needs no owner lookup (ADR 0092).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_BED_COMPONENT, {
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
