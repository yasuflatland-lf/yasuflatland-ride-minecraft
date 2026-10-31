import type { BlockPermutation } from "@minecraft/server";
import {
  type BlockState,
  blockStateOf,
} from "../../../domain/build/blockState";

export function stateOfPermutation(permutation: BlockPermutation): BlockState {
  return blockStateOf(permutation.type.id, permutation.getAllStates());
}
