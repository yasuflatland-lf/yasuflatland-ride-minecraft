import type {
  AimReader,
  AimResult,
} from "../../../../application/build/ports/aim";
import {
  type Facing,
  facingVector,
} from "../../../../domain/build/rotation/facing";
import type { Cell } from "../../../../domain/shared/cells";
import type { PlayerId } from "../../../../domain/shared/ids";

/** Keeps client rotation updates from changing a scripted facing or hit. */
export class TestAimReader implements AimReader {
  private readonly hits = new Map<PlayerId, Cell>();
  private readonly facings = new Map<PlayerId, Facing>();

  constructor(private readonly reader: AimReader) {}

  setFacing(playerId: PlayerId, facing: Facing | undefined): void {
    if (facing === undefined) this.facings.delete(playerId);
    else this.facings.set(playerId, facing);
  }

  setHit(playerId: PlayerId, cell: Cell | undefined): void {
    if (cell === undefined) this.hits.delete(playerId);
    else this.hits.set(playerId, cell);
  }

  dimensionOf(playerId: PlayerId) {
    return this.reader.dimensionOf(playerId);
  }

  aim(playerId: PlayerId): AimResult | undefined {
    const aim = this.reader.aim(playerId);
    if (!aim) return undefined;
    const hit = this.hits.get(playerId);
    const facing = this.facings.get(playerId);
    const ray = facing
      ? { origin: aim.ray.origin, direction: facingVector(facing) }
      : aim.ray;
    if (hit) return { ray, block: { cell: hit, face: "up" } };
    return facing ? { ray } : aim;
  }
}
