import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CellOffset,
  FURNITURE_SPEC,
  type FurnitureKind,
  furnitureCells,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
  type SeatOffset,
} from "../../../src/domain/resort/furniture";
import {
  asFurnitureId,
  type FurnitureId,
} from "../../../src/domain/resort/ids";
import { cellKey } from "../../../src/domain/shared/cells";
import type { Facing4 } from "../../../src/domain/shared/facing";
import { forward } from "../../../src/domain/shared/vec";

const kinds: readonly FurnitureKind[] = [
  "dining_table",
  "dining_chair",
  "sofa_single",
  "sofa_double",
];
const facings: readonly Facing4[] = [0, 90, 180, 270];
const cellArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});
const yawArb = fc.double({ min: -720, max: 720, noNaN: true });
const playerRight: Record<Facing4, { x: number; z: number }> = {
  0: { x: -1, z: 0 },
  90: { x: 0, z: -1 },
  180: { x: 1, z: 0 },
  270: { x: 0, z: 1 },
};

describe("furniture placement", () => {
  for (const kind of kinds) {
    for (const facing of facings) {
      it(`${kind} has distinct floor cells, support and clearance at player yaw ${facing}`, () => {
        fc.assert(
          fc.property(cellArb, (block) => {
            const pose = furniturePose(block, facing, kind);
            const spec = FURNITURE_SPEC[kind];
            const floor = furnitureCells(pose);
            expect(floor).toHaveLength(spec.cells.length);
            expect(new Set(floor.map(cellKey)).size).toBe(floor.length);
            expect(floor[0]).toEqual({ ...block, y: block.y + 1 });
            for (const cell of floor) expect(cell.y).toBe(block.y + 1);
            expect(furnitureSupportCells(pose)).toEqual(
              floor.map((cell) => ({ ...cell, y: cell.y - 1 })),
            );
            const clear = furnitureClearCells(pose);
            expect(clear).toHaveLength(floor.length * spec.clearance);
            const clearKeys = new Set(clear.map(cellKey));
            expect(clearKeys.size).toBe(clear.length);
            for (const cell of floor)
              for (let up = 0; up < spec.clearance; up++)
                expect(
                  clearKeys.has(cellKey({ ...cell, y: cell.y + up })),
                ).toBe(true);
            expect(pose.origin).toEqual({
              x:
                floor.reduce((sum, cell) => sum + cell.x + 0.5, 0) /
                floor.length,
              y: block.y + 1,
              z:
                floor.reduce((sum, cell) => sum + cell.z + 0.5, 0) /
                floor.length,
            });
            expect(pose.yaw).toBe((facing + 180) % 360);
          }),
        );
      });
    }
  }

  it("extends the double sofa to the player's right at every facing", () => {
    fc.assert(
      fc.property(cellArb, (block) => {
        for (const facing of facings) {
          const pose = furniturePose(block, facing, "sofa_double");
          const [first, second] = furnitureCells(pose);
          if (!first || !second) throw new Error("Expected two sofa cells");
          const right = playerRight[facing];
          expect(second).toEqual({
            x: first.x + right.x,
            y: first.y,
            z: first.z + right.z,
          });
          expect(pose.origin).toEqual({
            x: first.x + 0.5 + right.x / 2,
            y: first.y,
            z: first.z + 0.5 + right.z / 2,
          });
        }
      }),
    );
  });

  it("faces toward the player for arbitrary headings and every kind", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (block, yaw) => {
        for (const kind of kinds) {
          const pose = furniturePose(block, yaw, kind);
          const facing = forward(pose.yaw);
          const player = forward(yaw);
          expect(facings).toContain(pose.yaw);
          expect(facing.x * player.x + facing.z * player.z).toBeLessThanOrEqual(
            -Math.SQRT1_2 + 1e-12,
          );
        }
      }),
    );
  });

  it("centres a dining chair above a negative-coordinate block", () => {
    const pose = furniturePose({ x: -4, y: 12, z: -7 }, 90, "dining_chair");
    expect(pose).toEqual({
      kind: "dining_chair",
      yaw: 270,
      origin: { x: -3.5, y: 13, z: -6.5 },
    });
    expect(furnitureCells(pose)).toEqual([{ x: -4, y: 13, z: -7 }]);
  });

  it("places a south-looking player's sofa across the x boundary", () => {
    const pose = furniturePose({ x: 10, y: 64, z: 20 }, 0, "sofa_double");
    expect(pose.origin).toEqual({ x: 10, y: 65, z: 20.5 });
    expect(furnitureCells(pose)).toEqual([
      { x: 10, y: 65, z: 20 },
      { x: 9, y: 65, z: 20 },
    ]);
  });

  it("places a west-looking player's sofa across the z boundary", () => {
    const pose = furniturePose({ x: -3, y: 0, z: 5 }, 90, "sofa_double");
    expect(pose.origin).toEqual({ x: -2.5, y: 1, z: 5 });
    expect(furnitureCells(pose)).toEqual([
      { x: -3, y: 1, z: 5 },
      { x: -3, y: 1, z: 4 },
    ]);
  });
});

describe("furniture spec", () => {
  it("deeply freezes all per-kind tuning", () => {
    function expectFrozen(value: unknown): void {
      if (value === null || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) expectFrozen(child);
    }
    expectFrozen(FURNITURE_SPEC);
  });

  it("provides per-kind seats and the finalized Dining Table surface", () => {
    const seats: readonly (readonly SeatOffset[])[] = [
      [],
      [{ x: 0, y: 0.45, z: 0.05 }],
      [{ x: 0, y: 0.4, z: 0.05 }],
      [
        { x: -0.5, y: 0.4, z: 0.05 },
        { x: 0.5, y: 0.4, z: 0.05 },
      ],
    ];
    expect(kinds.map((kind) => FURNITURE_SPEC[kind].seats)).toEqual(seats);
    expect(FURNITURE_SPEC.dining_table.top).toEqual({
      half: { halfX: 6, halfZ: 6 },
      topPx: 12,
      limit: 1,
      clearanceBase: 0,
    });
    for (const kind of kinds) {
      const spec = FURNITURE_SPEC[kind];
      expect(spec.clearance).toBe(2);
      expect(spec.hitsToTakeBack).toBe(3);
      expect(spec.hitResetTicks).toBe(100);
      if (kind !== "dining_table") expect(spec.top).toBeUndefined();
    }
    const doubleCells: readonly CellOffset[] = [
      { ahead: 0, left: 0 },
      { ahead: 0, left: -1 },
    ];
    expect(FURNITURE_SPEC.sofa_double.cells).toEqual(doubleCells);
  });

  it("brands furniture ids without changing them", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const id: FurnitureId = asFurnitureId(raw);
        expect(id).toBe(raw);
      }),
    );
  });
});
