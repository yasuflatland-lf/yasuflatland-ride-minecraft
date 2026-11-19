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

// Bedrock recomputes stair corners from neighboring blocks after placement.
const DERIVED_STATE_KEYS: ReadonlySet<string> = new Set(["minecraft:corner"]);

export function sameBlockState(a: BlockState, b: BlockState): boolean {
  return sameBlockStateByKeys(a, b, Object.keys);
}

export function sameBlockStateIgnoringDerived(
  a: BlockState,
  b: BlockState,
): boolean {
  return sameBlockStateByKeys(a, b, (states) =>
    Object.keys(states).filter((key) => !DERIVED_STATE_KEYS.has(key)),
  );
}

function sameBlockStateByKeys(
  a: BlockState,
  b: BlockState,
  keysOf: (states: BlockState["states"]) => string[],
): boolean {
  if (a.typeId !== b.typeId) return false;
  const keys = keysOf(a.states);
  if (keys.length !== keysOf(b.states).length) return false;
  return keys.every(
    (key) => Object.hasOwn(b.states, key) && a.states[key] === b.states[key],
  );
}

export const AIR: BlockState = blockStateOf("minecraft:air");
