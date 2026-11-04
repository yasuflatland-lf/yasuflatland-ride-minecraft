import type { RoofTentId } from "../../domain/camp/ids";
import type { PlayerId } from "../../domain/shared/ids";
import { SLEEP } from "../../domain/shared/sleep";
import type { SleepInBed } from "../shared/sleepInBed";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class SleepInRoofTent {
  constructor(
    private readonly world: RoofTentOccupantWorld,
    private readonly sleep: SleepInBed,
  ) {}

  execute(cmd: { playerId: PlayerId; tentId: RoofTentId }): boolean {
    const dimensionId = this.world.dimensionOf(cmd.tentId);
    const slept = this.sleep.execute({
      playerId: cmd.playerId,
      dimensionId,
      cell: this.world.spawnCellOf(cmd.tentId),
    });
    if (dimensionId === SLEEP.dimension)
      this.world.setSpawnSetBy(cmd.tentId, cmd.playerId);
    return slept;
  }
}
