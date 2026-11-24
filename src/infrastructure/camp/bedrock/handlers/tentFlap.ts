// Routes a player's tap on a tent flap cell to that flap (ADR 0105, 0132).
import { system } from "@minecraft/server";
import type { UseTentFlap } from "../../../../application/camp/useTentFlap";
import type { FlapId, TentId } from "../../../../domain/camp/tent";
import { type Cell, cellOf } from "../../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
} from "../../../../domain/shared/ids";
import { TENT_FLAP_COMPONENT } from "../../identifiers";

export function registerTentFlap(
  useFlap: UseTentFlap,
  flapAt: (
    dimensionId: DimensionId,
    cell: Cell,
  ) => { tentId: TentId; flap: FlapId } | undefined,
): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(TENT_FLAP_COMPONENT, {
      onPlayerInteract: (ev) => {
        const hit = flapAt(
          asDimensionId(ev.dimension.id),
          cellOf(ev.block.location),
        );
        if (!hit) return;
        useFlap.execute({
          tentId: hit.tentId,
          flap: hit.flap,
          tick: system.currentTick,
          playerId: ev.player ? asPlayerId(ev.player.id) : undefined,
        });
      },
    });
  });
}
