import {
  type Block,
  BlockVolume,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import type { Clock } from "../../../application/vehicle/ports/shared";
import { KEPT_BLOCKS } from "../../../domain/shared/keptBlocks";
import type { CutColumn } from "../../../domain/vehicle/cut";
import { AIR_BLOCK, LAID_BLOCK_TAG } from "../../shared/identifiers";
import { DropSweep } from "./dropSweep";

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

export class BladeCuts {
  constructor(
    clock: Clock,
    private readonly drops: DropSweep = new DropSweep(clock),
  ) {}

  /** Clears each column in `dimension` with one filtered fill (ADR 0137). */
  cut(dimension: Dimension, columns: readonly CutColumn[]): void {
    for (const column of columns) {
      try {
        this.cutColumn(dimension, column);
      } catch {
        // An unloaded chunk or a failed fill is retried by the drive on a later tick (ADR 0125, 0137).
      }
    }
  }

  /** Removes `entity` and returns true when it is a drop of a recent fill (ADR 0137). */
  sweepDrop(entity: Entity): boolean {
    return this.drops.sweep(entity);
  }

  private cutColumn(
    dimension: Dimension,
    { x, z, bottom, height, minHeight }: CutColumn,
  ): void {
    const start = Math.max(bottom, dimension.heightRange.min);
    const first = dimension.getBlock({ x, y: start, z });
    if (!first) return;
    const top =
      height === undefined
        ? Math.min(
            Math.max(
              nonAirTop(dimension, x, z, start, first),
              bottom + (minHeight ?? 0) - 1,
            ),
            dimension.heightRange.max - 1,
          )
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
    this.drops.record(
      dimension.id,
      { x, y: start, z },
      { x: x + 1, y: top + 1, z: z + 1 },
    );
  }
}
