import fc from "fast-check";
import { expect, it } from "vitest";
import {
  beachChairCells,
  beachChairPose,
} from "../../../src/domain/resort/beachChair";
import { beachChairExit } from "../../../src/domain/resort/beachChairExit";
import { cellKey } from "../../../src/domain/shared/cells";

it("returns only a safe cell outside the bed at every heading", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      fc.constantFrom(0, 90, 180, 270),
      (x, z, yaw) => {
        const pose = beachChairPose({ x, y: 63, z }, yaw);
        const cells = new Set(beachChairCells(pose).map(cellKey));
        const exit = beachChairExit(pose, (feet) => feet.y === 64);
        expect(exit).toBeDefined();
        if (!exit) throw Error("missing exit");
        expect(exit.y).toBe(64);
        expect(cells.has(cellKey(exit))).toBe(false);
        expect(beachChairExit(pose, () => false)).toBeUndefined();
        expect(
          beachChairExit(pose, (feet) => cellKey(feet) === cellKey(exit)),
        ).toEqual(exit);
      },
    ),
  );
});

it.each([
  [0, { x: 11, y: 64, z: 21 }],
  [90, { x: 10, y: 64, z: 21 }],
  [180, { x: 9, y: 64, z: 20 }],
  [270, { x: 11, y: 64, z: 19 }],
] as const)(
  "starts in the adjacent side cell for player yaw %i",
  (yaw, expected) => {
    const pose = beachChairPose({ x: 10, y: 63, z: 20 }, yaw);
    expect(beachChairExit(pose, (feet) => feet.y === 64)).toEqual(expected);
  },
);
