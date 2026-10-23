// Pitches a tent from its item on the top of a block (ADR 0024, 0131).
import { Direction, system, world } from "@minecraft/server";
import type {
  PitchTent,
  PitchTentCommand,
} from "../../../../application/camp/pitchTent";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { TENT_ITEM } from "../../identifiers";

export function registerTentPlacement(pitchTent: PitchTent): void {
  const requested = new TickScopedSet<PlayerId>();
  // A before-event cannot change the world, so the pitch runs on the next tick
  // (ADR 0024). A press on one of our blocks is left to that block.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (
      !ev.isFirstEvent ||
      ev.itemStack?.typeId !== TENT_ITEM ||
      ev.blockFace !== Direction.Up
    )
      return;
    const dimensionId = asDimensionId(ev.block.dimension.id);
    const clicked = ev.block.location;
    if (!pitchTent.accepts(dimensionId, clicked)) return;
    ev.cancel = true;
    const playerId = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, playerId)) return;
    const cmd: PitchTentCommand = {
      playerId,
      dimensionId,
      clicked: { x: clicked.x, y: clicked.y, z: clicked.z },
      yaw: ev.player.getRotation().y,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => pitchTent.execute(cmd));
  });
}
