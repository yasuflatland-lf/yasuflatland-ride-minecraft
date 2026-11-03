import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TENT_LAYOUT_VERSION } from "../../../src/domain/camp/spec";
import { asTentId, type TentYaw } from "../../../src/domain/camp/tent";
import {
  legacyTents,
  parseTents,
  serializeTents,
  type TentEntry,
  withoutTent,
  withTent,
} from "../../../src/domain/camp/tentRegistry";
import { asDimensionId } from "../../../src/domain/shared/ids";

const arbEntry: fc.Arbitrary<TentEntry> = fc.record({
  layout: fc.nat({ max: 10 }),
  id: fc.string({ minLength: 1 }).map(asTentId),
  dimensionId: fc.string().map(asDimensionId),
  pose: fc.record({
    x: fc.integer(),
    y: fc.integer({ min: -64, max: 320 }),
    z: fc.integer(),
    yaw: fc.constantFrom<TentYaw>(0, 90, 180, -90),
  }),
});

const SAVED =
  '[{"id":"-4294967295","dimensionId":"minecraft:overworld","pose":{"x":110,"y":-60,"z":46,"yaw":180}}]';

describe("tent registry (ADR 0131)", () => {
  it("round-trips any list", () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 6 }), (list) => {
        expect(parseTents(serializeTents(list))).toEqual(list);
      }),
    );
  });

  it("reads and writes the fixed saved shape", () => {
    const list = parseTents(SAVED);
    expect(list).toEqual([
      {
        layout: 1,
        id: "-4294967295",
        dimensionId: "minecraft:overworld",
        pose: { x: 110, y: -60, z: 46, yaw: 180 },
      },
    ]);
    expect(serializeTents(list)).toBe(`${SAVED.slice(0, -2)},"layout":1}]`);
  });

  it("reads all unversioned entries as layout 1", () => {
    fc.assert(
      fc.property(fc.array(arbEntry), (list) => {
        const saved = JSON.stringify(
          list.map(({ layout: _layout, ...entry }) => entry),
        );
        expect(parseTents(saved)).toEqual(
          list.map((entry) => ({ ...entry, layout: 1 })),
        );
      }),
    );
  });

  it("selects exactly the entries older than the current layout", () => {
    fc.assert(
      fc.property(fc.array(arbEntry), fc.nat({ max: 12 }), (list, current) => {
        expect(legacyTents(list, current)).toEqual(
          list.filter((entry) => entry.layout < current),
        );
        expect(legacyTents(list)).toEqual(
          list.filter((entry) => entry.layout < TENT_LAYOUT_VERSION),
        );
      }),
    );
  });

  it("drops malformed input", () => {
    const good = JSON.parse(SAVED)[0];
    for (const raw of [undefined, 3, "not json", '{"id":"1"}', "null"])
      expect(parseTents(raw)).toEqual([]);
    const bad = [
      { ...good, pose: { ...good.pose, yaw: 45 } },
      { ...good, pose: { ...good.pose, x: 1.5 } },
      { ...good, pose: { ...good.pose, z: "3" } },
      { dimensionId: good.dimensionId, pose: good.pose },
      { ...good, id: "" },
      { ...good, pose: undefined },
      ...[-1, 1.5, "1", null, 9007199254740992].map((layout) => ({
        ...good,
        layout,
      })),
      null,
    ];
    expect(parseTents(JSON.stringify([...bad, good]))).toEqual(
      parseTents(SAVED),
    );
  });

  it("replaces an entry with the same id, and removes one by id", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbEntry, { selector: (e) => e.id, maxLength: 6 }),
        arbEntry,
        (list, entry) => {
          const added = withTent(list, entry);
          expect(added.filter((e) => e.id === entry.id)).toEqual([entry]);
          expect(added).toHaveLength(
            list.length + (list.some((e) => e.id === entry.id) ? 0 : 1),
          );
          const removed = withoutTent(added, entry.id);
          expect(removed.some((e) => e.id === entry.id)).toBe(false);
          expect(removed).toHaveLength(added.length - 1);
        },
      ),
    );
  });
});
