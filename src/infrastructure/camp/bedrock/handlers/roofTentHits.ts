import { Player, system, world } from "@minecraft/server";
import type { FoldRoofTent } from "../../../../application/camp/foldRoofTent";
import type { PaintRoofTent } from "../../../../application/camp/paintRoofTent";
import { asRoofTentId } from "../../../../domain/camp/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { ROOF_TENT_TYPE } from "../../identifiers";

export function registerRoofTentHits(
  fold: FoldRoofTent,
  paint: PaintRoofTent,
): void {
  const swung = new TickScopedSet<PlayerId>();
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player) || ev.hitEntity.typeId !== ROOF_TENT_TYPE)
      return;
    const playerId = asPlayerId(player.id);
    const tick = system.currentTick;
    if (!swung.add(tick, playerId)) return;
    const cmd = { playerId, tentId: asRoofTentId(ev.hitEntity.id), tick };
    const dye = heldDye(player);
    if (dye) paint.execute({ ...cmd, paint: dye });
    else fold.execute(cmd);
  });
}
