import { BlockVolume, type Dimension, type Entity } from "@minecraft/server";
import type { Clock } from "../../../application/vehicle/ports/shared";
import type { Vec3 } from "../../../domain/shared/vec";
import { CUT_KEPT_BLOCKS, type CutColumn } from "../../../domain/vehicle/cut";
import { AIR_BLOCK, LAID_BLOCK_TAG } from "../../shared/identifiers";

// ADR 0137 records the drop distance and delay measured in game.
const DROP_MARGIN = 1;
const DROP_WINDOW_TICKS = 1;
interface FillRecord {
  dimensionId: string;
  min: Vec3;
  max: Vec3;
  tick: number;
}

export class BladeCuts {
  private fills: FillRecord[] = [];
  constructor(private readonly clock: Clock) {}

  /** Clears each column in `dimension` with one filtered fill (ADR 0137). */
  cut(dimension: Dimension, columns: readonly CutColumn[]): void {
    this.prune();
    for (const { x, z, bottom, height } of columns) {
      const start = Math.max(bottom, dimension.heightRange.min);
      const last = dimension.heightRange.max - 1;
      try {
        const first = dimension.getBlock({ x, y: start, z });
        if (!first) continue;
        let top = start - 1;
        if (height === undefined) {
          for (let y = start; y <= last; y++) {
            const block = y === start ? first : dimension.getBlock({ x, y, z });
            if (!block || block.isAir) break;
            top = y;
          }
        } else top = Math.min(bottom + height - 1, last);
        if (top < start) continue;
        dimension.fillBlocks(
          new BlockVolume({ x, y: start, z }, { x, y: top, z }),
          AIR_BLOCK,
          {
            blockFilter: {
              excludeTypes: [...CUT_KEPT_BLOCKS],
              excludeTags: [LAID_BLOCK_TAG],
            },
            ignoreChunkBoundErrors: true,
          },
        );
        this.fills.push({
          dimensionId: dimension.id,
          min: { x, y: start, z },
          max: { x: x + 1, y: top + 1, z: z + 1 },
          tick: this.clock.now(),
        });
      } catch {
        // An unloaded chunk or a failed fill is retried by the drive on a later tick (ADR 0125, 0137).
      }
    }
  }

  sweepDrop(entity: Entity): boolean {
    this.prune();
    if (!entity.isValid || entity.typeId !== "minecraft:item") return false;
    const now = this.clock.now();
    const p = entity.location;
    const matches = this.fills.some((record) => {
      const dt = now - record.tick;
      return (
        entity.dimension.id === record.dimensionId &&
        dt >= 0 &&
        dt <= DROP_WINDOW_TICKS &&
        p.x >= record.min.x - DROP_MARGIN &&
        p.x <= record.max.x + DROP_MARGIN &&
        p.y >= record.min.y - DROP_MARGIN &&
        p.y <= record.max.y + DROP_MARGIN &&
        p.z >= record.min.z - DROP_MARGIN &&
        p.z <= record.max.z + DROP_MARGIN
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
