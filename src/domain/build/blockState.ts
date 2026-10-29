// A block type with its states, comparable regardless of key order.
export type StateValue = string | number | boolean;

export interface BlockState {
  readonly typeId: string;
  readonly states: Readonly<Record<string, StateValue>>;
}

export function blockStateOf(
  typeId: string,
  states: Record<string, StateValue> = {},
): BlockState {
  const sorted = Object.fromEntries(
    Object.entries(states).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return Object.freeze({ typeId, states: Object.freeze(sorted) });
}

export function sameBlockState(a: BlockState, b: BlockState): boolean {
  if (a.typeId !== b.typeId) return false;
  const keys = Object.keys(a.states);
  if (keys.length !== Object.keys(b.states).length) return false;
  return keys.every(
    (key) => Object.hasOwn(b.states, key) && a.states[key] === b.states[key],
  );
}

export const AIR: BlockState = blockStateOf("minecraft:air");
