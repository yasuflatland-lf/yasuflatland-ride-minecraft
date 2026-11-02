import { type Player, system, world } from "@minecraft/server";
import type { EnterRoofTent } from "../../../../application/camp/enterRoofTent";
import type { RoofTentOccupantWorld } from "../../../../application/camp/ports/roofTentOccupant";
import { ROOF_TENT_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { ROOF_TENT_SNEAK_HINT, ROOF_TENT_TYPE } from "../../identifiers";

export function registerRoofTentEnter(
  enter: EnterRoofTent,
  occupants: RoofTentOccupantWorld,
  showMenu: (player: Player, tentId: string) => Promise<void>,
  track: (playerId: PlayerId, tentId: string) => void,
): void {
  const pressed = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const { player, target } = ev;
    if (target.typeId !== ROOF_TENT_TYPE || heldDye(player)) return;
    ev.cancel = true;
    const playerId = asPlayerId(player.id);
    if (!pressed.add(system.currentTick, playerId)) return;
    system.run(() => {
      if (!player.isValid || !target.isValid || heldDye(player)) return;
      const tentId = target.id;
      if (occupants.occupantOf(tentId) === playerId) {
        track(playerId, tentId);
        void showMenu(player, tentId);
        return;
      }
      if (player.dimension.id !== target.dimension.id) return;
      const a = player.location;
      const b = target.location;
      if (
        Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >
        ROOF_TENT_SPEC.interactReach
      )
        return;
      if (!player.isSneaking) {
        player.onScreenDisplay.setActionBar({
          translate: ROOF_TENT_SNEAK_HINT,
        });
        return;
      }
      if (enter.execute({ playerId, tentId })) track(playerId, tentId);
    });
  });
}
