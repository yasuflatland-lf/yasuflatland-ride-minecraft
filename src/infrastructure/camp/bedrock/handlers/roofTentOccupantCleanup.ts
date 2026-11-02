import { system, world } from "@minecraft/server";
import type { LeaveRoofTent } from "../../../../application/camp/leaveRoofTent";
import type { RoofTentOccupantWorld } from "../../../../application/camp/ports/roofTentOccupant";
import { ROOF_TENT_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { playerById } from "../../../shared/players";

const RESTORE_SCAN_TICKS = 20;
const ENTRY_GRACE_TICKS = 10;
const MAX_RESEAT_ATTEMPTS = 40;
const OFFLINE_GRACE_TICKS = 20 * 30;

export function registerRoofTentOccupantCleanup(
  leave: LeaveRoofTent,
  occupants: RoofTentOccupantWorld,
  loadedTents: () => readonly string[] = () => [],
): (playerId: PlayerId, tentId: string) => void {
  // Occupancy is persisted on the tent, but this map is not, so a script reload or
  // a server restart loses it. The scan below rebuilds it from the loaded tents.
  const tracked = new Map<
    PlayerId,
    {
      tentId: string;
      released: boolean;
      offlineTicks: number;
      trackedTicks: number;
      reseatAttempts: number;
    }
  >();
  let ticks = 0;
  const restore = () => {
    for (const tentId of loadedTents()) {
      const occupant = occupants.occupantOf(tentId);
      if (occupant !== undefined && !tracked.has(occupant))
        tracked.set(occupant, {
          tentId,
          released: false,
          offlineTicks: 0,
          trackedTicks: 0,
          reseatAttempts: 0,
        });
    }
  };
  const cleanup = (playerId: PlayerId) => {
    const entry = tracked.get(playerId);
    if (!entry) return;
    tracked.delete(playerId);
    if (occupants.occupantOf(entry.tentId) === playerId)
      leave.execute({ playerId, tentId: entry.tentId });
    else occupants.reveal(playerId);
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
    if (ticks++ % RESTORE_SCAN_TICKS === 0) restore();
    for (const [playerId, entry] of tracked) {
      if (occupants.occupantOf(entry.tentId) !== playerId) {
        occupants.reveal(playerId);
        tracked.delete(playerId);
        continue;
      }
      const player = playerById(playerId);
      if (!player?.isValid) {
        // A restored occupant may still be joining; only a long absence frees the tent.
        if (++entry.offlineTicks > OFFLINE_GRACE_TICKS) cleanup(playerId);
        continue;
      }
      entry.offlineTicks = 0;
      // Require release before another sneak so the entry gesture cannot eject.
      if (!player.isSneaking) entry.released = true;
      else if (entry.released) {
        cleanup(playerId);
        continue;
      }
      const seated = occupants.isSeated(playerId, entry.tentId);
      if (seated === undefined) continue;
      // A toggled mobile sneak button stays latched after the dismount press, so the
      // grace must not wait for a release: an unseated rider leaves after it.
      const inEntryGrace = entry.trackedTicks < ENTRY_GRACE_TICKS;
      if (
        seated &&
        entry.trackedTicks % ROOF_TENT_SPEC.concealRefreshTicks === 0
      )
        occupants.conceal(playerId);
      entry.trackedTicks++;
      if (!seated) {
        if (inEntryGrace && entry.reseatAttempts < MAX_RESEAT_ATTEMPTS) {
          entry.reseatAttempts++;
          occupants.moveInside(playerId, entry.tentId);
        } else cleanup(playerId);
      }
    }
  }, 1);
  return (playerId, tentId) => {
    if (tracked.get(playerId)?.tentId !== tentId)
      tracked.set(playerId, {
        tentId,
        released: false,
        offlineTicks: 0,
        trackedTicks: 0,
        reseatAttempts: 0,
      });
  };
}
