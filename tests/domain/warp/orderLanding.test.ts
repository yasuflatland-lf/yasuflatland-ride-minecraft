import fc from "fast-check";
import { expect, it } from "vitest";
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

it("searches top, four lower sides, then four upper sides and takes the first standable cell", () => {
  fc.assert(
    fc.property(cell, fc.func(fc.boolean()), (c, standable) => {
      const candidates = landingCandidates(c);
      expect(candidates).toHaveLength(9);
      expect(candidates[0]).toEqual({ ...c, y: c.y + 1 });
      for (let i = 1; i < candidates.length; i++) {
        const p = candidates[i];
        if (!p) throw Error("missing candidate");
        expect(p.y).toBe(c.y + (i > 4 ? 1 : 0));
        expect(Math.abs(p.x - c.x) + Math.abs(p.z - c.z)).toBe(1);
      }
      expect(new Set(candidates.map((p) => JSON.stringify(p))).size).toBe(9);
      const visited: unknown[] = [];
      const chosen = chooseLanding(c, (p) => {
        visited.push(p);
        return standable(p);
      });
      const first = candidates.findIndex((p) => standable(p));
      expect(chosen).toEqual(first < 0 ? candidates[0] : candidates[first]);
      expect(visited).toEqual(
        candidates.slice(0, first < 0 ? candidates.length : first + 1),
      );
      expect(chooseLanding(c, () => false)).toEqual(candidates[0]);
    }),
  );
});
