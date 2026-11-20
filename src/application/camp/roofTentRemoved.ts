import type { RoofTentId } from "../../domain/camp/ids";
import type { PlayerId } from "../../domain/shared/ids";
import { forEachIsolated } from "../shared/isolated";
import type { BedWorld } from "../shared/ports/bed";
import type { Logger } from "../shared/ports/logger";
import type { OccupantEjector, RoofTentRemoved } from "./ports/roofTent";
import type { RoofTentOccupantWorld } from "./ports/roofTentOccupant";

export class ClearRoofTentSpawn implements RoofTentRemoved {
  constructor(
    private readonly occupantWorld: RoofTentOccupantWorld,
    private readonly bed: BedWorld,
    private readonly log: Logger,
  ) {}

  removed(tentId: RoofTentId, _ownerId: PlayerId | undefined): void {
    const setters = this.occupantWorld.spawnSetters(tentId);
    if (setters.length === 0) return;
    const dimension = this.occupantWorld.dimensionOf(tentId);
    const cell = this.occupantWorld.spawnCellOf(tentId);
    forEachIsolated(
      setters,
      (player) => this.bed.clearSpawnPoint(player, dimension, cell),
      this.log,
      (player) => `Roof tent ${tentId} spawn cleanup for ${player}`,
    );
    this.occupantWorld.clearSpawnSetters(tentId);
  }
}

/** Cleans up a roof tent after folding, host removal, or external entity removal. */
export class RoofTentCleanup implements RoofTentRemoved {
  constructor(
    private readonly world: RoofTentOccupantWorld,
    private readonly ejector: OccupantEjector,
    private readonly spawn: RoofTentRemoved,
  ) {}

  removed(tentId: RoofTentId, ownerId: PlayerId | undefined): void {
    this.ejector.eject(tentId);
    this.world.clearCeiling(tentId);
    this.spawn.removed(tentId, ownerId);
    this.world.forget(tentId);
  }
}
