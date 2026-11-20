import fc from "fast-check";
import { expect, it } from "vitest";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { distanceSq } from "../../../src/domain/shared/vec";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import {
  chooseLanding,
  landingCandidates,
} from "../../../src/domain/warp/landing";
import { parseWarpName } from "../../../src/domain/warp/warpName";
import { orderForPlayer, pageOf } from "../../../src/domain/warp/warpOrder";
import { cell, point } from "./arbitraries";

it("orders a permutation by dimension, distance, name and id without mutating inputs", () => {
  fc.assert(
    fc.property(fc.array(point), point, (points, player) => {
      const before = structuredClone(points);
      const from = { dimension: player.dimension, position: player.cell };
      const ordered = orderForPlayer(points, from);
      expect([...ordered].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [...points].sort((a, b) => a.id.localeCompare(b.id)),
      );
      const keys = ordered.map((p) =>
        p.dimension === from.dimension
          ? ([0, distanceSq(p.cell, from.position), p.name, p.id] as const)
          : ([1, p.dimension, p.name, p.id] as const),
      );
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1];
        const b = keys[i];
        if (!a || !b) throw Error("missing key");
        for (let j = 0; j < a.length; j++) {
          const left = a[j];
          const right = b[j];
          if (left === undefined || right === undefined)
            throw Error("missing key part");
          if (left === right) continue;
          expect(left < right).toBe(true);
          break;
        }
      }
      expect(points).toEqual(before);
      expect(orderForPlayer(ordered, from)).toEqual(ordered);
    }),
  );
});

it("breaks equal-distance ties by name then id and sorts other dimensions by id", () => {
  fc.assert(
    fc.property(point, (p) => {
      const points = [
        ["c", "B", p.dimension, 1],
        ["b", "A", p.dimension, -1],
        ["a", "A", p.dimension, 1],
        ["f", "A", "z-other", 0],
        ["e", "B", "a-other", 0],
        ["d", "A", "a-other", 0],
      ].map(([id, rawName, dimension, dx]) => {
        const name = parseWarpName(String(rawName));
        if (!name) throw Error("missing name");
        return {
          ...p,
          id: asWarpPointId(String(id)),
          name,
          dimension: asDimensionId(String(dimension)),
          cell: { ...p.cell, x: p.cell.x + Number(dx) },
        };
      });
      expect(
        orderForPlayer(points, {
          dimension: p.dimension,
          position: p.cell,
        }).map((q) => q.id),
      ).toEqual(["a", "b", "c", "d", "e", "f"]);
    }),
  );
});

it("pages cover every item exactly once and clamp out-of-range indices", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer()),
      fc.integer({ min: 1, max: 30 }),
      fc.integer(),
      (items, size, index) => {
        const count = Math.max(1, Math.ceil(items.length / size));
        const paged = pageOf(items, index, size);
        expect(paged.pageCount).toBe(count);
        expect(paged.pageIndex).toBe(Math.min(count - 1, Math.max(0, index)));
        expect(
          Array.from(
            { length: count },
            (_, i) => pageOf(items, i, size).items,
          ).flat(),
        ).toEqual(items);
      },
    ),
  );
});

it("covers both rises of the 5x5 square in landing priority order", () => {
  fc.assert(
    fc.property(cell, (origin) => {
      const candidates = landingCandidates(origin);
      expect(candidates).toHaveLength(49);
      expect(new Set(candidates.map(cellKey)).size).toBe(49);
      const keys = candidates.map((feet) => {
        const dx = feet.x - origin.x;
        const dz = feet.z - origin.z;
        const rise = feet.y - origin.y;
        expect(Number.isInteger(dx) && Math.abs(dx) <= 2).toBe(true);
        expect(Number.isInteger(dz) && Math.abs(dz) <= 2).toBe(true);
        expect([0, 1]).toContain(rise);
        expect(feet).not.toEqual(origin);
        return [
          distanceSq(origin, feet),
          Number(dx !== 0 || dz !== 0),
          rise,
          dx,
          dz,
        ];
      });
      for (const [index, key] of keys.slice(1).entries()) {
        const previous = keys[index];
        if (!previous) throw Error("missing previous key");
        const firstDifference = key
          .map((part, i) => part - Number(previous[i]))
          .find((delta) => delta !== 0);
        expect(firstDifference).toBeGreaterThan(0);
      }
    }),
  );
});

it("stops at the earliest standable candidate", () => {
  fc.assert(
    fc.property(
      cell,
      fc.uniqueArray(fc.integer({ min: 0, max: 48 }), { minLength: 1 }),
      (origin, indices) => {
        const candidates = landingCandidates(origin);
        const standable = new Set(
          indices
            .map((index) => candidates[index])
            .filter((feet): feet is Cell => feet !== undefined)
            .map(cellKey),
        );
        const visited: Cell[] = [];
        const chosen = chooseLanding(origin, (feet) => {
          visited.push(feet);
          return standable.has(cellKey(feet));
        });
        const first = Math.min(...indices);
        expect(chosen).toEqual(candidates[first]);
        expect(visited).toEqual(candidates.slice(0, first + 1));
      },
    ),
  );
});

it("falls back above the block after exhausting the candidates", () => {
  fc.assert(
    fc.property(cell, (origin) => {
      const visited: Cell[] = [];
      expect(
        chooseLanding(origin, (feet) => {
          visited.push(feet);
          return false;
        }),
      ).toEqual({ ...origin, y: origin.y + 1 });
      expect(visited).toEqual(landingCandidates(origin));
    }),
  );
});

it("lands on top when every candidate is standable", () => {
  expect(chooseLanding({ x: 3, y: 64, z: -7 }, () => true)).toEqual({
    x: 3,
    y: 65,
    z: -7,
  });
});
