import type { Brand } from "./ids";

/** A duration counted in game ticks. Assignable to `number`. */
export type Ticks = Brand<number, "Ticks">;

export const TICKS_PER_SECOND = 20;

export function ticks(n: number): Ticks {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError(`Ticks must be a non-negative integer, got ${n}`);
  return n as Ticks;
}

export function seconds(s: number): Ticks {
  return ticks(Math.round(s * TICKS_PER_SECOND));
}
