import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Cell, cellKey } from "../../../../src/domain/shared/cells";
import { dot, forward, rightOf } from "../../../../src/domain/shared/vec";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { CAMPER_PROFILE } from "../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { profileOf } from "../../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import {
  headlightCells,
  relight,
} from "../../../../src/domain/vehicle/lighting/headlights";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const coord = fc.double({ min: -1e5, max: 1e5, noNaN: true });
const location = fc.record({
  x: coord,
  y: fc.double({ min: -64, max: 300, noNaN: true }),
  z: coord,
});
// fc.double draws most values within a hair of 0, so it barely turns the
// vehicle off the z axis. Whole hundredths of a degree cover every heading.
const yaw = fc.integer({ min: -18_000, max: 18_000 }).map((c) => c / 100);
const level = fc.integer({ min: 0, max: 15 });
const litCell = fc.record({
  level,
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
});
const cells = fc.uniqueArray(litCell, { selector: cellKey });
const keys = (cs: readonly Cell[]) => new Set(cs.map(cellKey));
const beams = fc.oneof(
  fc.constantFrom(...VEHICLE_KINDS.map((k) => profileOf(k).beams)),
  fc.array(number(0, 40), { maxLength: 8 }).chain((reach) =>
    fc.record({
      reach: fc.constant(reach),
      lanes: fc.array(number(-8, 8), { maxLength: 6 }),
      levels: fc.option(
        fc.array(level, { minLength: reach.length, maxLength: reach.length }),
        { nil: undefined },
      ),
    }),
  ),
);

describe("headlightCells (ADR 0020)", () => {
  it("lights one block above the ground, ahead of the vehicle and in front of its body, within the reach", () => {
    fc.assert(
      fc.property(location, yaw, (at, y) => {
        const f = forward(y);
        const out = headlightCells(at, y, SUV_PROFILE.beams);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(SUV_SPEC.headlightReach.length);
        for (const c of out) {
          expect(c.y).toBe(Math.floor(at.y) + 1);
          // The cell's center, measured along and across the heading
          const d = { x: c.x + 0.5 - at.x, z: c.z + 0.5 - at.z };
          const ahead = dot(d, f);
          expect(ahead).toBeGreaterThan(SUV_SPEC.bodyFront);
          expect(ahead).toBeLessThan(Math.max(...SUV_SPEC.headlightReach) + 1);
          expect(Math.abs(dot(d, rightOf(f)))).toBeLessThan(1);
        }
      }),
    );
  });

  it("places each beam lane sideways from its reach and deduplicates cells", () => {
    const location = fc.record({
      x: number(-100, 100),
      y: number(-64, 300),
      z: number(-100, 100),
    });
    fc.assert(
      fc.property(beams, location, yaw, (pattern, at, heading) => {
        const out = headlightCells(at, heading, pattern);
        expect(out.length).toBeLessThanOrEqual(
          pattern.reach.length * pattern.lanes.length,
        );
        expect(new Set(out.map(cellKey)).size).toBe(out.length);
        for (const c of out)
          expect([c.x, c.y, c.z].every(Number.isInteger)).toBe(true);
        const f = forward(heading);
        const right = rightOf(f);
        const expected = new Set<string>();
        for (const reach of pattern.reach) {
          for (const lane of pattern.lanes) {
            const origin = {
              x: at.x + f.x * reach,
              y: at.y,
              z: at.z + f.z * reach,
            };
            const shifted = {
              x: origin.x + right.x * lane,
              y: origin.y,
              z: origin.z + right.z * lane,
            };
            const single = headlightCells(shifted, heading, {
              reach: [0],
              lanes: [0],
            });
            for (const cell of single) expected.add(cellKey(cell));
          }
        }
        expect(new Set(out.map(cellKey))).toEqual(expected);
      }),
    );
  });

  it("gives each cell the brightest level among the beams that floor into it, and 15 for a pattern without levels", () => {
    fc.assert(
      fc.property(beams, location, yaw, (pattern, at, heading) => {
        const expected = new Map<string, number>();
        const f = forward(heading);
        const right = rightOf(f);
        for (const [i, reach] of pattern.reach.entries()) {
          for (const lane of pattern.lanes) {
            const shifted = {
              x: at.x + f.x * reach + right.x * lane,
              y: at.y,
              z: at.z + f.z * reach + right.z * lane,
            };
            for (const c of headlightCells(shifted, heading, {
              reach: [0],
              lanes: [0],
            })) {
              const key = cellKey(c);
              expected.set(
                key,
                Math.max(expected.get(key) ?? 0, pattern.levels?.[i] ?? 15),
              );
            }
          }
        }
        const out = headlightCells(at, heading, pattern);
        expect(out.map(cellKey)).toEqual([...expected.keys()]);
        for (const c of out) expect(c.level).toBe(expected.get(cellKey(c)));
      }),
    );
  });

  it.each(["suv", "sportsboat", "camper"] as const)(
    "lights every %s cell at level 15, as before levels existed",
    (kind) => {
      fc.assert(
        fc.property(location, yaw, (at, y) => {
          const pattern = profileOf(kind).beams;
          const out = headlightCells(at, y, pattern);
          expect(out.every((c) => c.level === 15)).toBe(true);
          expect(keys(out)).toEqual(
            keys(
              headlightCells(at, y, {
                reach: pattern.reach,
                lanes: pattern.lanes,
              }),
            ),
          );
        }),
      );
    },
  );

  it("lights the bulldozer's beams at 8, 12, 15, 15, 15", () => {
    expect(
      headlightCells({ x: 0.5, y: 64, z: 0.5 }, 0, {
        reach: [6, 10, 15, 21, 27],
        levels: [8, 12, 15, 15, 15],
        lanes: [0],
      }).map((c) => c.level),
    ).toEqual([8, 12, 15, 15, 15]);
  });

  it.each([
    ["SUV", SUV_PROFILE.beams, SUV_SPEC.headlightReach],
    ["camper", CAMPER_PROFILE.beams, CAMPER_SPEC.headlightReach],
  ] as const)(
    "lights one %s cell per reach on the center line, since the reaches are farther apart than a cell's diagonal",
    (_kind, beams, reaches) => {
      fc.assert(
        fc.property(location, yaw, (at, y) => {
          const f = forward(y);
          const out = headlightCells(at, y, beams);
          expect(out).toHaveLength(reaches.length);
          for (const c of out) {
            const d = { x: c.x + 0.5 - at.x, z: c.z + 0.5 - at.z };
            expect(Math.abs(dot(d, rightOf(f)))).toBeLessThan(1);
          }
        }),
      );
    },
  );
});

describe("relight (ADR 0020)", () => {
  it("clears exactly the lit cells no longer wanted and lights exactly the wanted cells not lit yet", () => {
    fc.assert(
      fc.property(cells, cells, (lit, wanted) => {
        const { clear, light } = relight(lit, wanted);
        const after = new Set([
          ...[...keys(lit)].filter((k) => !keys(clear).has(k)),
          ...keys(light),
        ]);
        expect(after).toEqual(keys(wanted));
        for (const c of clear) expect(keys(lit).has(cellKey(c))).toBe(true);
        for (const c of light) expect(keys(lit).has(cellKey(c))).toBe(false);
      }),
    );
  });

  it("changes nothing when the wanted cells are already lit", () => {
    fc.assert(
      fc.property(cells, (lit) => {
        expect(relight(lit, lit)).toEqual({ clear: [], light: [] });
      }),
    );
  });
});
