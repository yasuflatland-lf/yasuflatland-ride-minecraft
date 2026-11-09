import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asParasolId } from "../../../src/domain/resort/ids";
import {
  type ParasolPose,
  parasolCeilingCells,
  parasolFootCells,
  parasolPose,
  parasolSupportCell,
  tooCloseToOtherBase,
} from "../../../src/domain/resort/parasolPose";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
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
        const pose = parasolPose(pressed, yaw);
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
        const pose = parasolPose(pressed, yaw);
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
        expect(parasolPose(pressed, yaw).yaw).toBe(snapYaw4(yaw + 180));
      }),
    );
  });

  it("turns the base around the centre with every quarter turn of yaw", () => {
    fc.assert(
      fc.property(
        cellArb,
        fc.integer({ min: -4, max: 4 }),
        (pressed, turns) => {
          const a = parasolPose(pressed, turns * 90);
          const b = parasolPose(pressed, turns * 90 + 90);
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

  it("keeps every foot cell more than 2 blocks from the canopy centre along the facing axis", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(pressed, yaw);
        for (const cell of parasolFootCells(pose)) {
          const dx = Math.abs(cell.x + 0.5 - pose.canopyCenter.x);
          const dz = Math.abs(cell.z + 0.5 - pose.canopyCenter.z);
          expect(Math.max(dx, dz)).toBeGreaterThan(2);
        }
      }),
    );
  });

  it("lists the foot cells above the base and the support below it", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(pressed, yaw);
        const cells = parasolFootCells(pose);
        expect(cells).toHaveLength(PARASOL_SPEC.footCells.length);
        expect(cells[0]).toEqual(pose.base);
        expect(parasolSupportCell(pose)).toEqual({
          ...pose.base,
          y: pose.base.y - 1,
        });
      }),
    );
  });

  it("lays the rain ceiling over a centred 3 by 4 rectangle in either orientation", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(pressed, yaw);
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
  });

  it("lays every ceiling cell at one height above the canopy top", () => {
    fc.assert(
      fc.property(cellArb, yawArb, (pressed, yaw) => {
        const pose = parasolPose(pressed, yaw);
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
  const base = { x: 10, y: 64, z: 10 };

  it("is true at distance 1 and false at distance 2", () => {
    expect(tooCloseToOtherBase(base, [{ x: 11, y: 64, z: 11 }])).toBe(true);
    expect(tooCloseToOtherBase(base, [{ x: 10, y: 64, z: 10 }])).toBe(true);
    expect(tooCloseToOtherBase(base, [{ x: 12, y: 64, z: 10 }])).toBe(false);
    expect(tooCloseToOtherBase(base, [{ x: 12, y: 64, z: 12 }])).toBe(false);
  });

  it("is false with no other base", () => {
    expect(tooCloseToOtherBase(base, [])).toBe(false);
  });

  it("matches the Chebyshev distance for any pair", () => {
    fc.assert(
      fc.property(cellArb, cellArb, (a, b) => {
        const d = Math.max(
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.z - b.z),
        );
        expect(tooCloseToOtherBase(a, [b])).toBe(
          d < PARASOL_SPEC.minBaseDistance,
        );
      }),
    );
  });
});

describe("asParasolId", () => {
  it("returns its argument", () => {
    expect(asParasolId("abc")).toBe("abc");
  });
});
