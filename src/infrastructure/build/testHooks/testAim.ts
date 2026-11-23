import {
  type Facing,
  facingVector,
} from "../../../domain/build/rotation/facing";
import type { Cell } from "../../../domain/shared/cells";
import type { PlayerId } from "../../../domain/shared/ids";
import type { AimOverride } from "../bedrock/bedrockAimReader";

// Keeps client rotation updates from changing a scripted facing or hit.
export class TestAimReader {
  constructor(private readonly overrides: Map<PlayerId, AimOverride>) {}

  setFacing(playerId: PlayerId, facing: Facing | undefined): void {
    const override = this.overrides.get(playerId);
    const direction = facing === undefined ? undefined : facingVector(facing);
    const block = override?.target?.block;
    this.set(playerId, {
      input: override?.input,
      target:
        direction || block ? { direction, block, input: "pointer" } : undefined,
    });
  }

  setHit(playerId: PlayerId, cell: Cell | undefined): void {
    const override = this.overrides.get(playerId);
    const direction = override?.target?.direction;
    const block = cell ? { cell, face: "up" as const } : undefined;
    this.set(playerId, {
      input: override?.input,
      target:
        direction || block ? { direction, block, input: "pointer" } : undefined,
    });
  }

  setTouch(playerId: PlayerId, enabled: boolean): void {
    this.set(playerId, {
      input: enabled ? "touch" : undefined,
      target: this.overrides.get(playerId)?.target,
    });
  }

  private set(playerId: PlayerId, override: AimOverride): void {
    if (override.input || override.target)
      this.overrides.set(playerId, override);
    else this.overrides.delete(playerId);
  }
}
