import { BlockPermutation, world } from "@minecraft/server";
import type { BuildBlockWorld } from "../../../application/build/ports/blocks";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { BlockState } from "../../../domain/build/blockState";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { LAID_BLOCK_TAG } from "../identifiers";
import { stateOfPermutation } from "./blockStates";

export class BedrockBlockWorld implements BuildBlockWorld {
  constructor(private readonly deps: { isProtected: SpaceCheck }) {}

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
