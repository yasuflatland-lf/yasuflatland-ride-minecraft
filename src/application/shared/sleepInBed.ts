// Use case: a player long-pressed or used a bed block (ADR 0092).

import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canSleep, SLEEP, SLEEP_MESSAGES } from "../../domain/shared/sleep";
import type { Vec3 } from "../../domain/shared/vec";
import type { BedWorld } from "./ports/bed";

export interface SleepInBedCommand {
  playerId: PlayerId;
  dimensionId: DimensionId;
  cell: Vec3;
}

export class SleepInBed {
  constructor(private readonly world: BedWorld) {}

  /** Returns whether the player slept. */
  execute(cmd: SleepInBedCommand): boolean {
    if (cmd.dimensionId !== SLEEP.dimension) return false;
    this.world.setSpawnPoint(cmd.playerId, cmd.dimensionId, cmd.cell);
    if (!canSleep(this.world.timeOfDay())) {
      this.world.showMessage(cmd.playerId, SLEEP_MESSAGES.nightOnly);
      return false;
    }
    this.world.sleep(cmd.playerId);
    return true;
  }
}
