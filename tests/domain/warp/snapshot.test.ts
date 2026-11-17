import fc from "fast-check";
import { expect, it } from "vitest";
import {
  parseSnapshot,
  toSnapshot,
  WARP_REGISTRY_VERSION,
  type WarpRegistrySnapshot,
} from "../../../src/domain/warp/snapshot";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { pointsOf } from "../../../src/domain/warp/warpRegistry";
import { point, registry } from "./arbitraries";

it("round trips every constructed registry and emits independent plain data", () => {
  fc.assert(
    fc.property(registry, (reg) => {
      const snapshot: WarpRegistrySnapshot = toSnapshot(reg);
      expect(snapshot.version).toBe(WARP_REGISTRY_VERSION);
      expect(parseSnapshot(snapshot)).toEqual(reg);
      expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(reg);
      const first = snapshot.points[0];
      if (first) expect(first.cell).not.toBe(pointsOf(reg)[0]?.cell);
    }),
  );
});

it("never throws on arbitrary input, including arbitrary point records", () => {
  fc.assert(
    fc.property(fc.anything(), (raw) => {
      expect(() => parseSnapshot(raw)).not.toThrow();
      expect(() =>
        parseSnapshot({ version: WARP_REGISTRY_VERSION, points: [raw] }),
      ).not.toThrow();
    }),
  );
});

it("skips invalid points, duplicate ids and occupied cells, and caps restored points", () => {
  fc.assert(
    fc.property(point, (p) => {
      const valid = { ...p, cell: { ...p.cell } };
      const invalid = [
        null,
        {},
        { ...valid, id: 3 },
        { ...valid, id: "" },
        { ...valid, name: "  " },
        { ...valid, owner: null },
        { ...valid, dimension: "" },
        { ...valid, cell: { x: 0.5, y: 0, z: 0 } },
        { ...valid, cell: { x: 0, y: Number.NaN, z: 0 } },
        { ...valid, cell: { x: 0, y: 0, z: Number.POSITIVE_INFINITY } },
        ...Object.keys(valid).map((key) =>
          Object.fromEntries(
            Object.entries(valid).filter(([field]) => field !== key),
          ),
        ),
      ];
      for (const raw of invalid) {
        const parsed = parseSnapshot({
          version: WARP_REGISTRY_VERSION,
          points: [raw],
        });
        if (!parsed) throw Error("unreadable registry");
        expect(pointsOf(parsed)).toEqual([]);
      }
      const points = [
        valid,
        ...invalid,
        { ...valid, cell: { ...valid.cell, x: -2000 } },
        { ...valid, id: "occupied" },
        ...Array.from({ length: WARP_SPEC.maxPoints + 5 }, (_, i) => ({
          ...valid,
          id: `extra-${i}`,
          cell: { ...valid.cell, x: 2000 + i },
        })),
      ];
      const parsed = parseSnapshot({ version: WARP_REGISTRY_VERSION, points });
      if (!parsed) throw Error("unreadable registry");
      expect(pointsOf(parsed)).toEqual([
        valid,
        ...points.slice(
          1 + invalid.length + 2,
          1 + invalid.length + 2 + WARP_SPEC.maxPoints - 1,
        ),
      ]);
    }),
  );
});

it("rejects unreadable snapshots and safely ignores cyclic point data", () => {
  for (const raw of [
    null,
    1,
    [],
    {},
    { version: 2, points: [] },
    { version: 1, points: {} },
  ])
    expect(parseSnapshot(raw)).toBeUndefined();
  const cyclic: { cell?: unknown } = {};
  cyclic.cell = cyclic;
  expect(parseSnapshot({ version: 1, points: [cyclic] })).toEqual(
    parseSnapshot({ version: 1, points: [] }),
  );
});
