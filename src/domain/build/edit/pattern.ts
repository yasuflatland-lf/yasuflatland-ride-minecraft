// What an edit places and which blocks a replace selects.
import type { BlockState, StateValue } from "../blockState";

/** What to place; one block state for now. */
export interface Pattern {
  readonly state: BlockState;
}

export interface Mask {
  readonly typeId: string;
  readonly states?: Readonly<Record<string, StateValue>>;
}

/** Same type, and every state the mask lists is equal; unlisted states are free. */
export function matches(mask: Mask, state: BlockState): boolean {
  if (mask.typeId !== state.typeId) return false;
  if (!mask.states) return true;
  return Object.entries(mask.states).every(
    ([key, value]) =>
      Object.hasOwn(state.states, key) && state.states[key] === value,
  );
}
