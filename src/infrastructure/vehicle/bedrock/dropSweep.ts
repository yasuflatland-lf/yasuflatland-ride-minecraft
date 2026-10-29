import type { Entity } from "@minecraft/server";
import type { Clock } from "../../../application/vehicle/ports/shared";
import type { Vec3 } from "../../../domain/shared/vec";

// ADR 0137 records the drop distance and delay measured in game.
const DROP_MARGIN = 1;
const DROP_WINDOW_TICKS = 1;

interface FillRecord {
  dimensionId: string;
  min: Vec3;
  max: Vec3;
  tick: number;
}

function isNearFill(p: Vec3, { min, max }: FillRecord): boolean {
  return (
    p.x >= min.x - DROP_MARGIN &&
    p.x <= max.x + DROP_MARGIN &&
    p.y >= min.y - DROP_MARGIN &&
    p.y <= max.y + DROP_MARGIN &&
    p.z >= min.z - DROP_MARGIN &&
    p.z <= max.z + DROP_MARGIN
  );
}

export class DropSweep {
  private fills: FillRecord[] = [];
  constructor(private readonly clock: Clock) {}

  /** Remembers a changed box (max exclusive, as the cut records it) so item drops spawned near it within DROP_WINDOW_TICKS are removed (ADR 0137). */
  record(dimensionId: string, min: Vec3, max: Vec3): void {
    this.prune();
    this.fills.push({ dimensionId, min, max, tick: this.clock.now() });
  }

  /**
   * Removes `entity` and returns true when it is an item that spawned in the
   * same dimension within DROP_MARGIN blocks of a recorded box and within
   * DROP_WINDOW_TICKS ticks after it, such as a torch the fill knocked off
   * (ADR 0137).
   */
  sweep(entity: Entity): boolean {
    this.prune();
    if (!entity.isValid || entity.typeId !== "minecraft:item") return false;
    const now = this.clock.now();
    const matches = this.fills.some((record) => {
      const dt = now - record.tick;
      return (
        entity.dimension.id === record.dimensionId &&
        dt >= 0 &&
        dt <= DROP_WINDOW_TICKS &&
        isNearFill(entity.location, record)
      );
    });
    if (!matches) return false;
    entity.remove();
    return true;
  }

  private prune(): void {
    const now = this.clock.now();
    this.fills = this.fills.filter(
      (record) => now - record.tick <= DROP_WINDOW_TICKS,
    );
  }
}
