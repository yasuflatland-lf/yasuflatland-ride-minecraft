import { BlockPermutation, type Dimension, world } from "@minecraft/server";
import type { BuildBlockWorld } from "../../../application/build/ports/blocks";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { BlockState } from "../../../domain/build/blockState";
import { isUsableMaterial } from "../../../domain/build/edit/guard";
import type { HeightRange } from "../../../domain/build/heightRange";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { LAID_BLOCK_TAG } from "../identifiers";
import { stateOfPermutation } from "./blockStates";

export function blockHeightRange(dimension: Dimension): HeightRange {
  const { min, max } = dimension.heightRange;
  return { minY: min, maxY: max - 1 };
}

export class BedrockBlockWorld implements BuildBlockWorld {
  constructor(private readonly deps: { isProtected: SpaceCheck }) {}

  heightRange(dimensionId: DimensionId): HeightRange {
    return blockHeightRange(world.getDimension(dimensionId));
  }

  materialOf(dimensionId: DimensionId, cell: Cell): BlockState | "refused" {
    const state = this.stateAt(dimensionId, cell);
    return isUsableMaterial(state) ? state : "refused";
  }

  isAir(dimensionId: DimensionId, cell: Cell): boolean {
    try {
      return world.getDimension(dimensionId).getBlock(cell)?.isAir === true;
    } catch {
      return false;
    }
  }

  stateAt(dimensionId: DimensionId, cell: Cell): BlockState | undefined {
    try {
      const permutation = world
        .getDimension(dimensionId)
        .getBlock(cell)?.permutation;
      return permutation ? stateOfPermutation(permutation) : undefined;
    } catch {
      return undefined;
    }
  }

  setState(dimensionId: DimensionId, cell: Cell, state: BlockState): boolean {
    try {
      const block = world.getDimension(dimensionId).getBlock(cell);
      if (!block) return false;
      block.setPermutation(
        BlockPermutation.resolve(state.typeId, state.states),
      );
      return true;
    } catch {
      return false;
    }
  }

  mayRestore(dimensionId: DimensionId, cell: Cell): boolean {
    return !this.deps.isProtected(dimensionId, cell);
  }

  mayEdit(dimensionId: DimensionId, cell: Cell): boolean {
    if (this.deps.isProtected(dimensionId, cell)) return false;
    try {
      const block = world.getDimension(dimensionId).getBlock(cell);
      return block !== undefined && !block.hasTag(LAID_BLOCK_TAG);
    } catch {
      return false;
    }
  }
}
