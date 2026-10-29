import {
  type Block,
  BlockVolume,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import type { Clock } from "../../../application/vehicle/ports/shared";
import { KEPT_BLOCKS } from "../../../domain/shared/keptBlocks";
import type { Vec3 } from "../../../domain/shared/vec";
import type { CutColumn } from "../../../domain/vehicle/cut";
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

/**
 * The highest cell of the unbroken non-air run from `start` up, or `start - 1`
 * when `first` is air. Only air or an unloaded cell ends the run, so liquids,
 * kept blocks, and light blocks extend it (ADR 0137).
 */
function nonAirTop(
  dimension: Dimension,
  x: number,
  z: number,
  start: number,
  first: Block,
): number {
  const last = dimension.heightRange.max - 1;
  let top = start - 1;
  for (let y = start; y <= last; y++) {
    const block = y === start ? first : dimension.getBlock({ x, y, z });
    if (!block || block.isAir) break;
    top = y;
  }
  return top;
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

export class BladeCuts {
  private fills: FillRecord[] = [];
  constructor(private readonly clock: Clock) {}

  /** Clears each column in `dimension` with one filtered fill (ADR 0137). */
  cut(dimension: Dimension, columns: readonly CutColumn[]): void {
    this.prune();
    for (const column of columns) {
      try {
        this.cutColumn(dimension, column);
      } catch {
        // An unloaded chunk or a failed fill is retried by the drive on a later tick (ADR 0125, 0137).
      }
    }
  }

  /**
   * Removes `entity` and returns true when it is an item that spawned in the
   * same dimension within DROP_MARGIN blocks of a fill and within
   * DROP_WINDOW_TICKS ticks after it, such as a torch the fill knocked off
   * (ADR 0137).
   */
  sweepDrop(entity: Entity): boolean {
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

  private cutColumn(
    dimension: Dimension,
    { x, z, bottom, height }: CutColumn,
  ): void {
    const start = Math.max(bottom, dimension.heightRange.min);
    const first = dimension.getBlock({ x, y: start, z });
    if (!first) return;
    const top =
      height === undefined
        ? nonAirTop(dimension, x, z, start, first)
        : Math.min(bottom + height - 1, dimension.heightRange.max - 1);
    if (top < start) return;
    dimension.fillBlocks(
      new BlockVolume({ x, y: start, z }, { x, y: top, z }),
      AIR_BLOCK,
      {
        blockFilter: {
          excludeTypes: [...KEPT_BLOCKS],
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
  }

  private prune(): void {
    const now = this.clock.now();
    this.fills = this.fills.filter(
      (record) => now - record.tick <= DROP_WINDOW_TICKS,
    );
  }
}
