import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  attempt,
  forEachIsolated,
} from "../../../src/application/shared/isolated";

const logger = () => {
  const lines: string[] = [];
  return { lines, warn: (m: string) => lines.push(m) };
};

type Item = { id: string; fails: boolean };

const failing = (called: string[]) => (item: Item) => {
  called.push(item.id);
  if (item.fails) throw new Error("x");
};

const items = fc.array(fc.record({ id: fc.string(), fails: fc.boolean() }));

describe("forEachIsolated", () => {
  it("calls fn for every item in order, and warns once per throwing item, in order", () => {
    fc.assert(
      fc.property(items, (items) => {
        const called: string[] = [];
        const log = logger();
        forEachIsolated(items, failing(called), log, (item) => item.id);
        expect(called).toEqual(items.map((i) => i.id));
        expect(log.lines).toEqual(
          items.filter((i) => i.fails).map((i) => `${i.id}: Error: x`),
        );
      }),
    );
  });

  it("never throws to the caller", () => {
    fc.assert(
      fc.property(items, (items) => {
        const called: string[] = [];
        const log = logger();
        expect(() =>
          forEachIsolated(items, failing(called), log, (item) => item.id),
        ).not.toThrow();
      }),
    );
  });

  it("calls label only for failing items", () => {
    const items: Item[] = [
      { id: "a", fails: false },
      { id: "b", fails: true },
      { id: "c", fails: false },
    ];
    const log = logger();
    const label = vi.fn((item: Item) => item.id);
    forEachIsolated(items, failing([]), log, label);
    expect(label).toHaveBeenCalledTimes(1);
    expect(label).toHaveBeenCalledWith(items[1]);
    expect(log.lines).toEqual(["b: Error: x"]);
  });

  it("works on a Set, not only arrays", () => {
    const called: string[] = [];
    const log = logger();
    forEachIsolated(
      new Set(["a", "b"]),
      (item) => {
        called.push(item);
      },
      log,
      (item) => item,
    );
    expect(called).toEqual(["a", "b"]);
    expect(log.lines).toEqual([]);
  });
});

describe("attempt", () => {
  it("returns true and logs nothing when fn succeeds", () => {
    const log = logger();
    const fn = vi.fn();
    expect(attempt(fn, log, "label")).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(log.lines).toEqual([]);
  });

  it("returns false and warns with `${label}: ${error}` when fn throws", () => {
    const log = logger();
    const result = attempt(
      () => {
        throw new Error("boom");
      },
      log,
      "job 7",
    );
    expect(result).toBe(false);
    expect(log.lines).toEqual(["job 7: Error: boom"]);
  });
});
