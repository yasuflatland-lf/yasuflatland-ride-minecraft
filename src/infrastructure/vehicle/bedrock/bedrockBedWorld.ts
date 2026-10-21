// Implements BedWorld with @minecraft/server (ADR 0012, 0092).
import { system, world } from "@minecraft/server";
import type { BedWorld } from "../../../application/vehicle/ports/bed";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { SLEEP } from "../../../domain/vehicle/dock/sleep";
import type { EntityIndex } from "./entityIndex";
import { messageKey } from "./identifiers";

export class BedrockBedWorld implements BedWorld {
  constructor(private readonly index: EntityIndex) {}

  timeOfDay(): number {
    return world.getTimeOfDay();
  }

  setSpawnPoint(
    playerId: PlayerId,
    dimensionId: DimensionId,
    cell: Vec3,
  ): void {
    this.index.player(playerId)?.setSpawnPoint({
      dimension: world.getDimension(dimensionId),
      x: cell.x,
      y: cell.y,
      z: cell.z,
    });
  }

  sleep(playerId: PlayerId): void {
    const player = this.index.player(playerId);
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
    this.index.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }
}
