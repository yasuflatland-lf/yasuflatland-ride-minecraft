import type { AimReader } from "../../../../application/build/ports/aim";
import {
  type Facing,
  facingVector,
} from "../../../../domain/build/rotation/facing";
import type { PlayerId } from "../../../../domain/shared/ids";

/** Keeps client rotation updates from changing a scripted, targetless aim. */
export class TestAimReader implements AimReader {
  private readonly facings = new Map<PlayerId, Facing>();

  constructor(private readonly reader: AimReader) {}

  setFacing(playerId: PlayerId, facing: Facing | undefined): void {
    if (facing === undefined) this.facings.delete(playerId);
    else this.facings.set(playerId, facing);
  }

  dimensionOf(playerId: PlayerId) {
    return this.reader.dimensionOf(playerId);
  }

  aim(playerId: PlayerId) {
    const aim = this.reader.aim(playerId);
    const facing = this.facings.get(playerId);
    return aim && facing
      ? { ray: { origin: aim.ray.origin, direction: facingVector(facing) } }
      : aim;
  }
}
