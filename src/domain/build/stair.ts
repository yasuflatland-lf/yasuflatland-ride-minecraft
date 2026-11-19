import { type BlockState, blockStateOf } from "./blockState";
import type { Facing } from "./rotation/facing";

export interface StairMaterial {
  readonly material: BlockState;
}

// Bedrock encodes the ascending side, opposite the requested descent (#2058).
const directionByDescent: Readonly<Record<Facing, number>> = {
  east: 1,
  west: 0,
  south: 3,
  north: 2,
};

export function stairMaterialOf(state: BlockState): StairMaterial | undefined {
  if (
    typeof state.states.weirdo_direction === "number" &&
    typeof state.states.upside_down_bit === "boolean"
  ) {
    return { material: state };
  }
  return undefined;
}

export function stairDescending(
  { material }: StairMaterial,
  toward: Facing,
): BlockState {
  return blockStateOf(material.typeId, {
    ...material.states,
    weirdo_direction: directionByDescent[toward],
    upside_down_bit: false,
  });
}

export function stairFlatTop({ material }: StairMaterial): BlockState {
  return blockStateOf(material.typeId, {
    ...material.states,
    upside_down_bit: true,
  });
}
