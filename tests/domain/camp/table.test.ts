import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  tableCells,
  tableOrigin,
  tableYaw,
} from "../../../src/domain/camp/table";

describe("camp table footprint", () => {
  it("keeps two adjacent ground cells on its long axis for any player turn", () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        fc.integer({ min: -1080, max: 1080 }),
        (clicked, turn) => {
          const yaw = tableYaw(turn);
          const alongX = Math.abs(yaw) % 180 === 0;
          expect(tableCells(clicked, yaw)).toEqual([
            clicked,
            {
              x: clicked.x + (alongX ? 1 : 0),
              y: clicked.y,
              z: clicked.z + (alongX ? 0 : 1),
            },
          ]);
        },
      ),
    );
  });
});

it("places the origin midway between the two top-face centers", () => {
  fc.assert(
    fc.property(
      fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
      fc.integer({ min: -1080, max: 1080 }),
      (clicked, turn) => {
        const yaw = tableYaw(turn);
        const [first, second] = tableCells(clicked, yaw);
        if (!first || !second) throw new Error("Expected two table cells");
        const origin = tableOrigin(clicked, yaw);
        expect(origin.y).toBe(clicked.y + 1);
        for (const axis of ["x", "z"] as const)
          expect(origin[axis] - (first[axis] + 0.5)).toBe(
            second[axis] + 0.5 - origin[axis],
          );
      },
    ),
  );
});
