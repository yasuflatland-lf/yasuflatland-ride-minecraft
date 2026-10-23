// Implements BedWorld with @minecraft/server (ADR 0012, 0092).
import { type Player, system, world } from "@minecraft/server";
import type { BedWorld } from "../../application/shared/ports/bed";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { SLEEP } from "../../domain/shared/sleep";
import type { Vec3 } from "../../domain/shared/vec";
import { messageKey } from "./identifiers";

interface PlayerLookup {
  player(playerId: PlayerId): Player | undefined;
}

export class BedrockBedWorld implements BedWorld {
  constructor(private readonly players: PlayerLookup) {}

  timeOfDay(): number {
    return world.getTimeOfDay();
  }

  setSpawnPoint(
    playerId: PlayerId,
    dimensionId: DimensionId,
    cell: Vec3,
  ): void {
    this.players.player(playerId)?.setSpawnPoint({
      dimension: world.getDimension(dimensionId),
      x: cell.x,
      y: cell.y,
      z: cell.z,
    });
  }

  sleep(playerId: PlayerId): void {
    const player = this.players.player(playerId);
    if (!player) return;
    player.camera.fade({
      fadeColor: { red: 0, green: 0, blue: 0 },
      fadeTime: {
        fadeInTime: SLEEP.fadeInSeconds,
        holdTime: SLEEP.holdSeconds,
        fadeOutTime: SLEEP.fadeOutSeconds,
      },
    });
    system.runTimeout(
      () => world.setTimeOfDay(SLEEP.wakeTime),
      SLEEP.wakeDelayTicks,
    );
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.players.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }
}
