import fc from "fast-check";
import { expect, it } from "vitest";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { searchExitCell } from "../../../src/domain/shared/exitSearch";

const search = fc.record({
  start: fc.record({
    x: fc.integer({ min: -100, max: 100 }),
    y: fc.integer({ min: -100, max: 100 }),
    z: fc.integer({ min: -100, max: 100 }),
  }),
  ring: fc.record({
    radius: fc.integer({ min: 0, max: 4 }),
    up: fc.integer({ min: 0, max: 4 }),
    down: fc.integer({ min: 0, max: 4 }),
  }),
});

function orderedCells(
  start: Cell,
  ring: { radius: number; up: number; down: number },
): Cell[] {
  const width = 2 * ring.radius + 1;
  const height = ring.up + ring.down + 1;
  const offsets = Array.from({ length: width * width * height }, (_, i) => ({
    x: (i % width) - ring.radius,
    y: Math.floor(i / (width * width)) - ring.down,
    z: (Math.floor(i / width) % width) - ring.radius,
  }));
  const radius = (c: Cell) => Math.max(Math.abs(c.x), Math.abs(c.z));
  return offsets
    .sort(
      (a, b) => radius(a) - radius(b) || a.x - b.x || a.z - b.z || b.y - a.y,
    )
    .map((c) => ({ x: start.x + c.x, y: start.y + c.y, z: start.z + c.z }));
}

it("returns the first safe, non-excluded cell in ring order", () => {
  fc.assert(
    fc.property(
      search,
      fc.func(fc.boolean()),
      fc.func(fc.boolean()),
      ({ start, ring }, excluded, isSafe) => {
        const candidates = orderedCells(start, ring);
        const expected = candidates.find((c) => !excluded(c) && isSafe(c));
        const visited: Cell[] = [];
        const result = searchExitCell(start, excluded, ring, (c) => {
          expect(excluded(c)).toBe(false);
          visited.push(c);
          return isSafe(c);
        });
        expect(result).toEqual(expected);
        if (result) {
          expect(excluded(result)).toBe(false);
          expect(isSafe(result)).toBe(true);
        }
        const end = expected
          ? candidates.indexOf(expected) + 1
          : candidates.length;
        expect(visited).toEqual(
          candidates.slice(0, end).filter((c) => !excluded(c)),
        );
      },
    ),
  );
});

it("can reach any candidate in the search volume", () => {
  fc.assert(
    fc.property(search, fc.nat(), ({ start, ring }, index) => {
      const candidates = orderedCells(start, ring);
      const target = candidates[index % candidates.length];
      if (!target) throw Error("missing candidate");
      expect(
        searchExitCell(
          start,
          () => false,
          ring,
          (c) => cellKey(c) === cellKey(target),
        ),
      ).toEqual(target);
    }),
  );
});

it("returns undefined after visiting every cell in ring order when none is safe", () => {
  fc.assert(
    fc.property(search, ({ start, ring }) => {
      const visited: Cell[] = [];
      expect(
        searchExitCell(
          start,
          () => false,
          ring,
          (c) => {
            visited.push(c);
            return false;
          },
        ),
      ).toBeUndefined();
      expect(visited).toEqual(orderedCells(start, ring));
      expect(
        searchExitCell(
          start,
          () => true,
          ring,
          () => true,
        ),
      ).toBeUndefined();
    }),
  );
});
