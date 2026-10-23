import { expect } from "vitest";
import { defined } from "./defined";
/** The [lo, hi) range of query.ground_speed each level plays in, in level order. */
export function speedRanges(
  entries: Record<string, string>[],
  prefix: string,
  guard: string,
): [number, number][] {
  return entries.map((entry, level) => {
    const [name, condition] = defined(
      Object.entries(entry)[0],
      `level ${level}`,
    );
    expect(name).toBe(`${prefix}${level}`);
    let rest = condition;
    if (guard) {
      expect(rest.startsWith(guard), name).toBe(true);
      rest = rest.slice(guard.length).replace(/^ && /, "");
    }
    const lo = /query\.ground_speed >= ([\d.]+)/.exec(rest)?.[1];
    const hi = /query\.ground_speed < ([\d.]+)/.exec(rest)?.[1];
    return [lo ? Number(lo) : 0, hi ? Number(hi) : Number.POSITIVE_INFINITY];
  });
}

export function expectContiguous(ranges: [number, number][]): void {
  expect(ranges[0]?.[0]).toBe(0);
  expect(ranges.at(-1)?.[1]).toBe(Number.POSITIVE_INFINITY);
  ranges.slice(1).forEach(([lo, hi], i) => {
    expect(lo).toBe(ranges[i]?.[1]);
    expect(lo).toBeLessThan(hi);
  });
}
