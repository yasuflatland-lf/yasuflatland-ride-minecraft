import { system, world } from "@minecraft/server";
import type { LeaveRoofTent } from "../../../../application/camp/leaveRoofTent";
import type { RoofTentOccupantWorld } from "../../../../application/camp/ports/roofTentOccupant";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { playerById } from "../../../shared/players";

export function registerRoofTentOccupantCleanup(
  leave: LeaveRoofTent,
  occupants: RoofTentOccupantWorld,
): (playerId: PlayerId, tentId: string) => void {
  const tracked = new Map<PlayerId, { tentId: string; released: boolean }>();
  const cleanup = (playerId: PlayerId) => {
    const entry = tracked.get(playerId);
    if (!entry) return;
    tracked.delete(playerId);
    if (occupants.occupantOf(entry.tentId) === playerId)
      leave.execute({ playerId, tentId: entry.tentId });
  };
  world.afterEvents.playerLeave.subscribe((ev) =>
    cleanup(asPlayerId(ev.playerId)),
  );
  world.afterEvents.entityDie.subscribe((ev) => {
    if (ev.deadEntity.typeId === "minecraft:player")
      cleanup(asPlayerId(ev.deadEntity.id));
  });
  world.afterEvents.playerDimensionChange.subscribe((ev) =>
    cleanup(asPlayerId(ev.player.id)),
  );
  system.runInterval(() => {
    for (const [playerId, entry] of tracked) {
      if (occupants.occupantOf(entry.tentId) !== playerId) {
        tracked.delete(playerId);
        continue;
      }
      const player = playerById(playerId);
      if (!player?.isValid) continue;
      // Require release before another sneak so the entry gesture cannot eject.
      if (!player.isSneaking) entry.released = true;
      else if (entry.released) cleanup(playerId);
    }
  }, 1);
  return (playerId, tentId) => {
    if (tracked.get(playerId)?.tentId !== tentId)
      tracked.set(playerId, { tentId, released: false });
  };
}
