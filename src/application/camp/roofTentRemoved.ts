import type { RoofTentId } from "../../domain/camp/ids";
import type { PlayerId } from "../../domain/shared/ids";
import type { BedWorld } from "../shared/ports/bed";
import type { RoofTentRemoved } from "./ports/roofTent";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class ClearRoofTentSpawn implements RoofTentRemoved {
  constructor(
    private readonly occupantWorld: RoofTentOccupantWorld,
    private readonly bed: BedWorld,
  ) {}

  removed(tentId: RoofTentId, _ownerId: PlayerId | undefined): void {
    const player = this.occupantWorld.spawnSetBy(tentId);
    if (player === undefined) return;
    this.bed.clearSpawnPoint(
      player,
      this.occupantWorld.dimensionOf(tentId),
      this.occupantWorld.spawnCellOf(tentId),
    );
    this.occupantWorld.setSpawnSetBy(tentId, undefined);
  }
}
