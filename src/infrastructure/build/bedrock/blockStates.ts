import { BlockPermutation } from "@minecraft/server";
import {
  type BlockState,
  blockStateOf,
} from "../../../domain/build/blockState";

export function stateOfPermutation(permutation: BlockPermutation): BlockState {
  return blockStateOf(permutation.type.id, permutation.getAllStates());
}

/** Throws when `typeId` does not name a block, such as a tool item. */
export function resolveBlockState(typeId: string): BlockState {
  return stateOfPermutation(BlockPermutation.resolve(typeId));
}
