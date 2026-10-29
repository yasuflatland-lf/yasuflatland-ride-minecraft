import { BlockPermutation, type Dimension } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asDimensionId } from "../../../domain/shared/ids";
import { PLACE_KEPT_BLOCKS } from "../../../domain/shared/keptBlocks";
import type { Pave } from "../../../domain/vehicle/pave";
import { LAID_BLOCK_TAG } from "../../shared/identifiers";
import type { DropSweep } from "./dropSweep";

const KEPT = new Set(PLACE_KEPT_BLOCKS);

/** Lays road blocks into the cells a drive chose, keeping the blocks the domain cannot see (ADR 0181). */
export class RoadPaver {
  private readonly permutations = new Map<string, BlockPermutation>();
  constructor(
    private readonly drops: DropSweep,
    private readonly skip: SpaceCheck,
  ) {}

  pave(dimension: Dimension, pave: Pave): void {
    const permutation = this.permutation(pave.block);
    if (!permutation) return;
    const dimensionId = asDimensionId(dimension.id);
    for (const cell of pave.cells) {
      try {
        const block = dimension.getBlock(cell);
        if (
          !block ||
          block.typeId === pave.block ||
          block.hasTag(LAID_BLOCK_TAG) ||
          KEPT.has(block.typeId) ||
          this.skip(dimensionId, cell)
        )
          continue;
        block.setPermutation(permutation);
        this.drops.record(dimension.id, cell, {
          x: cell.x + 1,
          y: cell.y + 1,
          z: cell.z + 1,
        });
      } catch {
        // An unloaded chunk or a failed set is retried by the drive on a later tick (ADR 0125, 0181).
      }
    }
  }

  private permutation(block: string): BlockPermutation | undefined {
    const cached = this.permutations.get(block);
    if (cached) return cached;
    try {
      const resolved = BlockPermutation.resolve(block);
      this.permutations.set(block, resolved);
      return resolved;
    } catch {
      return undefined;
    }
  }
}
