import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type ParasolPose,
  parasolCeilingCells,
  parasolFootCells,
  parasolPose,
  parasolPoseAt,
  parasolSupportCell,
  tooCloseToOtherBase,
} from "../../../src/domain/resort/parasolPose";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { snapYaw4 } from "../../../src/domain/shared/facing";

const cellArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});
const yawArb = fc.double({ min: -720, max: 720, noNaN: true });

describe("parasolPose", () => {
  it("puts the canopy centre in the middle of the pressed top face", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(cellOf(pressed), yaw);
        expect(pose.canopyCenter).toEqual({
          x: pressed.x + 0.5,
          y: pressed.y + 1,
          z: pressed.z + 0.5,
        });
        expect(pose.base.y).toBe(pressed.y + 1);
      }),
    );
  });

  it("puts the base baseOffset blocks away from the player along an axis", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(cellOf(pressed), yaw);
        const dx = Math.abs(pose.base.x - pressed.x);
        const dz = Math.abs(pose.base.z - pressed.z);
        expect(Math.max(dx, dz)).toBe(PARASOL_SPEC.baseOffset);
        expect(Math.min(dx, dz)).toBe(0);
      }),
    );
  });

  it("faces the entity back toward the player", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        expect(parasolPose(cellOf(pressed), yaw).yaw).toBe(snapYaw4(yaw + 180));
      }),
    );
  });

  it("turns the base around the centre with every quarter turn of yaw", () => {
    fc.assert(
      fc.property(
        cellArb,
        fc.integer({ min: -4, max: 4 }),
        (pressed, turns) => {
          const a = parasolPose(cellOf(pressed), turns * 90);
          const b = parasolPose(cellOf(pressed), turns * 90 + 90);
          const rel = (p: ParasolPose) => ({
            x: p.base.x - pressed.x,
            z: p.base.z - pressed.z,
          });
          const ra = rel(a);
          const rb = rel(b);
          // A quarter turn of the player's yaw turns the base offset a quarter turn around the centre.
          expect(rb).toEqual({ x: -ra.z + 0, z: ra.x });
        },
      ),
    );
  });

  it("returns unique integer clearance cells around the fractional base", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(cellOf(pressed), yaw);
        const cells = parasolFootCells(pose);
        expect(cells.length).toBeGreaterThan(PARASOL_SPEC.footCells.length);
        expect(new Set(cells.map((c) => JSON.stringify(c))).size).toBe(
          cells.length,
        );
        for (const cell of cells) {
          expect(cellOf(cell)).toEqual(cell);
          expect(cell.y).toBeGreaterThanOrEqual(pose.base.y);
        }
        const centre = cellOf({
          x: pose.base.x + 0.5,
          y: pose.base.y,
          z: pose.base.z + 0.5,
        });
        expect(cells).toContainEqual(centre);
        expect(parasolSupportCell(pose)).toEqual({
          ...centre,
          y: centre.y - 1,
        });
      }),
    );
  });

  it.each([
    [0, { x: 10, y: 63, z: 23 }],
    [90, { x: 7, y: 63, z: 20 }],
    [180, { x: 10, y: 63, z: 17 }],
    [270, { x: 13, y: 63, z: 20 }],
  ])("checks the block below the base centre at yaw %i", (yaw, support) => {
    expect(
      parasolSupportCell(parasolPose(cellOf({ x: 10, y: 63, z: 20 }), yaw)),
    ).toEqual(support);
  });

  it("checks both columns overlapped by the shifted base and bent pole", () => {
    const cells = parasolFootCells(
      parasolPose(cellOf({ x: 10, y: 63, z: 20 }), 0),
    );
    expect(cells).toContainEqual({ x: 10, y: 64, z: 22 });
    expect(cells).toContainEqual({ x: 10, y: 64, z: 25 });
    expect(cells).toContainEqual({ x: 10, y: 66, z: 24 });
    expect(cells).toContainEqual({ x: 10, y: 66, z: 25 });
    expect(cells).not.toContainEqual({ x: 10, y: 64, z: 21 });
    expect(cells).not.toContainEqual({ x: 10, y: 64, z: 26 });
  });

  it.each([0, 90, 180, 270])(
    "lays the rain ceiling over a centred 3 by 4 rectangle in either orientation at yaw %i",
    (yaw) => {
      fc.assert(
        fc.property(cellArb, (pressed) => {
          const pose = parasolPose(cellOf(pressed), yaw);
          const keys = new Set(
            parasolCeilingCells(pose).map((c) => `${c.x},${c.z}`),
          );
          const cx = Math.floor(pose.canopyCenter.x);
          const cz = Math.floor(pose.canopyCenter.z);
          for (const [halfX, halfZ] of [
            [1, 2],
            [2, 1],
          ] as const) {
            for (let dx = -halfX; dx <= halfX; dx++)
              for (let dz = -halfZ; dz <= halfZ; dz++)
                expect(keys.has(`${cx + dx},${cz + dz}`)).toBe(true);
          }
        }),
      );
    },
  );

  it("lays every ceiling cell at one height above the canopy top", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(cellOf(pressed), yaw);
        const cells = parasolCeilingCells(pose);
        expect(cells.length).toBeGreaterThan(0);
        const y = cells[0]?.y ?? Number.NaN;
        expect(cells.every((c) => c.y === y)).toBe(true);
        expect(y).toBeGreaterThan(pose.canopyCenter.y + PARASOL_SPEC.canopyTop);
      }),
    );
  });
});

describe("tooCloseToOtherBase", () => {
  it("checks every nearby base against the Chebyshev distance threshold", () => {
    const limit = PARASOL_SPEC.minBaseDistance;
    const delta = fc.integer({ min: -2 * limit, max: 2 * limit });
    const offsets = fc.array(fc.record({ x: delta, y: delta, z: delta }));
    const origin = { x: 10, y: 64, z: 10 };
    fc.assert(
      fc.property(cellArb, offsets, (base, offsets) => {
        const others = offsets.map(({ x, y, z }) => ({
          x: base.x + x,
          y: base.y + y,
          z: base.z + z,
        }));
        expect(tooCloseToOtherBase(base, others)).toBe(
          offsets.some(
            ({ x, y, z }) =>
              Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) < limit,
          ),
        );
      }),
      {
        examples: [
          [origin, []],
          [origin, [{ x: limit - 1, y: 0, z: 0 }]],
          [origin, [{ x: limit, y: 0, z: 0 }]],
        ],
      },
    );
  });
});

describe("parasolPoseAt", () => {
  it("rebuilds the placed pose from its base and facing", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const placed = parasolPose(cellOf(pressed), yaw);
        expect(parasolPoseAt(placed.base, placed.yaw)).toEqual(placed);
      }),
    );
  });
});
