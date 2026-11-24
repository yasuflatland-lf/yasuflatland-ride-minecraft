import fc from "fast-check";
import { expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../../src/domain/build/blockState";
import { planStairs } from "../../../../src/domain/build/edit/plan";
import { stairPreviewPoints } from "../../../../src/domain/build/preview/stairPreview";
import { facingVector } from "../../../../src/domain/build/rotation/facing";
import { BUILD_SPEC } from "../../../../src/domain/build/spec";
import {
  rolesOf,
  TERRACE_ROLES,
} from "../../../../src/domain/build/stairs/contents";
import {
  type StairRole,
  stairCellCount,
  stairCells,
} from "../../../../src/domain/build/stairs/roles";
import { rowCells, stairRowOf } from "../../../../src/domain/build/stairs/row";
import {
  goalRowTaps,
  levelAt,
  staircaseToward,
} from "../../../../src/domain/build/stairs/staircase";
import { cellKey } from "../../../../src/domain/shared/cells";
import {
  NETHER_RANGE,
  OVERWORLD_RANGE,
} from "../../../helpers/buildHeightRange";

const { minY: worldBottomY, maxY: worldTopY } = OVERWORLD_RANGE;
const { stairHeadroom } = BUILD_SPEC;
const axis = fc.constantFrom("x" as const, "z" as const);
const positive = fc.integer({ min: 1, max: 10 });
const coord = fc.integer({ min: -50, max: 50 });
const level = fc.oneof(
  fc.integer({ min: worldBottomY, max: worldTopY }),
  fc.constantFrom(worldBottomY - 1, worldBottomY, worldTopY, worldTopY + 1),
);
const rows = fc
  .tuple(axis, coord, level, coord, positive)
  .map(([along, x, y, z, span]) => {
    const to = { x, y, z };
    const from = { ...to, [along]: to[along] + span };
    const row = stairRowOf({ from, to });
    if (!row?.along) throw new Error("Expected a horizontal line");
    return { ...row, along: row.along };
  });
const side = fc.constantFrom(-1, 1);
const valid = fc
  .tuple(rows, positive, positive, side, side)
  .map(([row, run, height, runSign, riseSign]) => {
    const across = row.along === "x" ? "z" : "x";
    const s = staircaseToward(row, {
      ...row.min,
      [across]: row.min[across] + runSign * run,
      y: row.y + riseSign * height,
    });
    if (!s) throw new Error("Expected a valid staircase");
    return s;
  });
const roles = ["step", "below", "headroom", "above"] as const;

it("uses only the perpendicular hit offset and clamps the signed rise", () => {
  fc.assert(
    fc.property(rows, coord, coord, coord, (row, offset, sideways, dy) => {
      const across = row.along === "x" ? "z" : "x";
      const hit = {
        ...row.min,
        [row.along]: row.min[row.along] + sideways,
        [across]: row.min[across] + offset,
        y: row.y + dy,
      };
      const s = staircaseToward(row, hit);
      if (offset === 0 || dy === 0) {
        expect(s).toBeUndefined();
        return;
      }
      if (!s) throw new Error("Expected a valid staircase");
      expect(s.run).toBe(Math.abs(offset));
      expect(s.rise).toBe(Math.sign(dy) * Math.min(s.run, Math.abs(dy)));
      const direction = facingVector(s.toward);
      expect(direction[across]).toBe(Math.sign(offset));
      expect(Math.abs(direction[row.along])).toBe(0);
      const { from, to } = goalRowTaps(s);
      expect(from).toEqual({
        ...row.min,
        [across]: hit[across],
        y: row.y + s.rise,
      });
      expect(to).toEqual({
        ...row.max,
        [across]: hit[across],
        y: row.y + s.rise,
      });
    }),
  );
});

it("projects a single-cell row onto the dominant horizontal offset, preferring x on ties", () => {
  fc.assert(
    fc.property(
      fc.record({ x: coord, y: fc.integer({ min: 0, max: 100 }), z: coord }),
      coord,
      coord,
      coord,
      (cell, dx, dz, dy) => {
        const row = stairRowOf({ from: cell, to: cell });
        if (!row) throw new Error("Expected a single-cell row");
        expect(row.along).toBeUndefined();
        expect([...rowCells(row)]).toEqual([cell]);
        for (const zOffset of [dz, dx, -dx]) {
          const hit = { x: cell.x + dx, y: cell.y + dy, z: cell.z + zOffset };
          const s = staircaseToward(row, hit);
          const run = Math.max(Math.abs(dx), Math.abs(zOffset));
          if (!run || !dy) {
            expect(s).toBeUndefined();
            continue;
          }
          if (!s) throw new Error("Expected a one-wide staircase");
          const alongX = Math.abs(dx) >= Math.abs(zOffset);
          const rise = Math.sign(dy) * Math.min(run, Math.abs(dy));
          expect(s).toMatchObject({
            run,
            rise,
            toward: alongX
              ? dx > 0
                ? "east"
                : "west"
              : zOffset > 0
                ? "south"
                : "north",
          });
          const goal = {
            x: alongX ? hit.x : cell.x,
            y: cell.y + rise,
            z: alongX ? cell.z : hit.z,
          };
          expect(goalRowTaps(s)).toEqual({ from: goal, to: goal });
          expect(stairCellCount(s, new Set(["step"]), OVERWORLD_RANGE)).toBe(
            run + 1,
          );
        }
      },
    ),
  );
});

it("reaches every level monotonically with the deeper treads first", () => {
  fc.assert(
    fc.property(valid, (s) => {
      const levels = Array.from({ length: s.run + 1 }, (_, k) => levelAt(s, k));
      const allLevels = Array.from(
        { length: Math.abs(s.rise) + 1 },
        (_, k) => s.row.y + Math.sign(s.rise) * k,
      );
      expect([...new Set(levels)]).toEqual(allLevels);
      expect(levels[0]).toBe(s.row.y);
      expect(levels.at(-1)).toBe(s.row.y + s.rise);
      const depths = allLevels
        .slice(1)
        .map((y) => levels.filter((level) => level === y).length);
      expect(depths).toEqual([...depths].sort((a, b) => b - a));
      expect(Math.max(...depths) - Math.min(...depths)).toBeLessThanOrEqual(1);
      for (let k = 1; k < levels.length; k++) {
        const delta = (levelAt(s, k) - levelAt(s, k - 1)) * Math.sign(s.rise);
        expect(delta === 0 || delta === 1).toBe(true);
      }
    }),
  );
});

it.each([OVERWORLD_RANGE, NETHER_RANGE])(
  "enumerates exactly the requested world-clamped role ranges and counts each cell once in $minY..$maxY",
  (range) => {
    fc.assert(
      fc.property(valid, fc.subarray([...roles]), (s, requested) => {
        const selected = new Set<StairRole>(requested);
        const actual = [...stairCells(s, selected, range)];
        const byCell = new Map(
          actual.map(({ cell, role }) => [cellKey(cell), role]),
        );
        expect(byCell.size).toBe(actual.length);
        expect(stairCellCount(s, selected, range)).toBe(actual.length);
        const direction = facingVector(s.toward);
        const low = Math.min(s.row.y, s.row.y + s.rise);
        const high = Math.max(s.row.y, s.row.y + s.rise);
        let expected = 0;
        for (let k = 0; k <= s.run; k++) {
          const h = levelAt(s, k);
          for (
            let y = Math.max(range.minY, low);
            y <= Math.min(range.maxY, high + stairHeadroom);
            y++
          ) {
            const candidates = {
              step: y === h,
              below: low < y && y < h,
              headroom: h < y && y <= h + stairHeadroom,
              above: h < y,
            };
            const role = roles.find(
              (role) => selected.has(role) && candidates[role],
            );
            if (!role) continue;
            for (const rowCell of rowCells(s.row)) {
              expect(
                byCell.get(
                  cellKey({
                    x: rowCell.x + direction.x * k,
                    z: rowCell.z + direction.z * k,
                    y,
                  }),
                ),
              ).toBe(role);
              expected++;
            }
          }
        }
        expect(actual.length).toBe(expected);
        for (const { cell } of actual) {
          expect(cell.y).toBeGreaterThanOrEqual(range.minY);
          expect(cell.y).toBeLessThanOrEqual(range.maxY);
        }
      }),
    );
  },
);

it("plans only tread noses as descending stairs and uses flat tops or uniform blocks elsewhere", () => {
  const stone = blockStateOf("minecraft:stone");
  const oak = blockStateOf("minecraft:oak_stairs", {
    upside_down_bit: true,
    weirdo_direction: 3,
  });
  const descent = {
    north: { rising: 3, descending: 2 },
    south: { rising: 2, descending: 3 },
    west: { rising: 1, descending: 0 },
    east: { rising: 0, descending: 1 },
  };
  fc.assert(
    fc.property(valid, fc.boolean(), (s, useStairs) => {
      const selected = new Set<StairRole>(roles);
      const changes = new Map(
        [
          ...planStairs(s, selected, useStairs ? oak : stone, OVERWORLD_RANGE),
        ].map(({ cell, after }) => [cellKey(cell), after]),
      );
      const levels = Array.from({ length: s.run + 1 }, (_, k) => levelAt(s, k));
      for (const { cell, role, nose } of stairCells(
        s,
        selected,
        OVERWORLD_RANGE,
      )) {
        const across = s.row.along === "x" ? "z" : "x";
        const k = Math.abs(cell[across] - s.row.min[across]);
        const expectedNose =
          role === "step" &&
          k ===
            (s.rise > 0 ? levels.indexOf(cell.y) : levels.lastIndexOf(cell.y));
        expect(nose).toBe(expectedNose);
        const after = changes.get(cellKey(cell));
        if (role === "headroom" || role === "above") expect(after).toBe(AIR);
        else if (!useStairs) expect(after).toBe(stone);
        else
          expect(after).toEqual(
            blockStateOf(oak.typeId, {
              upside_down_bit: !expectedNose,
              weirdo_direction: expectedNose
                ? descent[s.toward][s.rise > 0 ? "rising" : "descending"]
                : 3,
            }),
          );
      }
    }),
  );
});

it("outlines the tread tops and keeps the goal end under a tight preview budget", () => {
  const row = stairRowOf({
    from: { x: 0, y: 0, z: 0 },
    to: { x: 2, y: 0, z: 0 },
  });
  const staircase = row && staircaseToward(row, { x: 1, y: 2, z: 4 });
  if (!staircase) throw new Error("Expected a valid staircase");
  const points = stairPreviewPoints(staircase, BUILD_SPEC.outlineMaxPoints);
  expect(points).toEqual(
    expect.arrayContaining([
      { x: 3, y: 1, z: 1 },
      { x: 3, y: 2, z: 3 },
      { x: 3, y: 3, z: 5 },
      { x: 2.5, y: 3, z: 4.5 },
    ]),
  );
  expect(stairPreviewPoints(staircase, 2)).toEqual([
    { x: 0, y: 1, z: 0 },
    { x: 2.5, y: 3, z: 4.5 },
  ]);
});

it("terraces exactly the above cells with air", () => {
  fc.assert(
    fc.property(valid, (s) => {
      const expected = [
        ...stairCells(s, new Set(["above"]), OVERWORLD_RANGE),
      ].map(({ cell }) => ({ cell, after: AIR }));
      expect([
        ...planStairs(
          s,
          TERRACE_ROLES,
          blockStateOf("minecraft:sand"),
          OVERWORLD_RANGE,
        ),
      ]).toEqual(expected);
    }),
  );
});

it.each([
  ["passage", ["step", "below", "headroom"]],
  ["fillBelow", ["step", "below"]],
  ["stepsOnly", ["step"]],
] as const)("%s selects its stair roles", (contents, expected) => {
  expect(rolesOf(contents)).toEqual(new Set(expected));
});

it("writes air exactly on Passage headroom cells", () => {
  fc.assert(
    fc.property(valid, (s) => {
      const airCells = [
        ...planStairs(
          s,
          rolesOf("passage"),
          blockStateOf("minecraft:stone"),
          OVERWORLD_RANGE,
        ),
      ]
        .filter(({ after }) => after.typeId === AIR.typeId)
        .map(({ cell }) => cell);
      expect(airCells).toEqual(
        [...stairCells(s, new Set(["headroom"]), OVERWORLD_RANGE)].map(
          ({ cell }) => cell,
        ),
      );
    }),
  );
});

it("fills below with flat-top stairs for either filled contents choice", () => {
  fc.assert(
    fc.property(
      valid,
      fc.constantFrom("passage" as const, "fillBelow" as const),
      fc.integer({ min: 0, max: 3 }),
      (s, contents, direction) => {
        const oak = blockStateOf("minecraft:oak_stairs", {
          weirdo_direction: direction,
          upside_down_bit: false,
        });
        const plan = new Map(
          [...planStairs(s, rolesOf(contents), oak, OVERWORLD_RANGE)].map(
            ({ cell, after }) => [cellKey(cell), after],
          ),
        );
        const flat = blockStateOf(oak.typeId, {
          weirdo_direction: direction,
          upside_down_bit: true,
        });
        for (const { cell } of stairCells(
          s,
          new Set(["below"]),
          OVERWORLD_RANGE,
        ))
          expect(plan.get(cellKey(cell))).toEqual(flat);
      },
    ),
  );
});
