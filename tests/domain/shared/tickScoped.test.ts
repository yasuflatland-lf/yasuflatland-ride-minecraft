import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  TickScopedMap,
  TickScopedSet,
} from "../../../src/domain/shared/tickScoped";

const tick = fc.integer({ min: 0, max: 4 }); // small range so ticks repeat
const key = fc.constantFrom("a", "b", "c");

describe("tickScoped", () => {
  it("TickScopedMap returns a value only within the tick it was set in", () => {
    const op = fc.oneof(
      fc.record({
        op: fc.constant("set" as const),
        tick,
        key,
        value: fc.integer(),
      }),
      fc.record({ op: fc.constant("get" as const), tick, key }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        const map = new TickScopedMap<string, number>();
        let modelTick: number | undefined;
        const model = new Map<string, number>();
        for (const o of ops) {
          if (o.tick !== modelTick) {
            model.clear();
            modelTick = o.tick;
          }
          if (o.op === "set") {
            map.set(o.tick, o.key, o.value);
            model.set(o.key, o.value);
          } else {
            expect(map.get(o.tick, o.key)).toBe(model.get(o.key));
          }
        }
      }),
    );
  });

  it("TickScopedSet.add is true exactly for the first add of a key in a run of equal ticks", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ tick, key }), { maxLength: 40 }),
        (ops) => {
          const set = new TickScopedSet<string>();
          let modelTick: number | undefined;
          const model = new Set<string>();
          for (const o of ops) {
            if (o.tick !== modelTick) {
              model.clear();
              modelTick = o.tick;
            }
            expect(set.add(o.tick, o.key)).toBe(!model.has(o.key));
            model.add(o.key);
          }
        },
      ),
    );
  });

  it("a value set in tick 7 is gone in tick 8 and does not come back in tick 7", () => {
    const map = new TickScopedMap<string, number>();
    map.set(7, "a", 1);
    expect(map.get(7, "a")).toBe(1);
    expect(map.get(8, "a")).toBeUndefined();
    expect(map.get(7, "a")).toBeUndefined();
  });
});
