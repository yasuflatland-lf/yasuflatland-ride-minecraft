import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player long-pressed or used the bed of a parked vehicle (ADR 0092).
import {
  canSleep,
  SLEEP,
  SLEEP_MESSAGES,
} from "../../domain/vehicle/dock/sleep";
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
