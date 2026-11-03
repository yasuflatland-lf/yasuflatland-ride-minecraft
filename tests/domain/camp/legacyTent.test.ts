import fc from "fast-check";
import { expect, it } from "vitest";
import {
  LEGACY_CLEAR_BOX,
  legacyTentClearCells,
} from "../../../src/domain/camp/legacyTent";
import type { TentYaw } from "../../../src/domain/camp/tent";
import { cellKey } from "../../../src/domain/shared/cells";
import { forward, leftOf } from "../../../src/domain/shared/vec";

it("covers exactly layout 1's cleanup box at every pose and yaw", () => {
  expect(LEGACY_CLEAR_BOX).toEqual({ halfWidth: 3, depth: 12, layers: 4 });
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -10000, max: 10000 }),
        y: fc.integer({ min: -60, max: 300 }),
        z: fc.integer({ min: -10000, max: 10000 }),
        yaw: fc.constantFrom<TentYaw>(0, 90, 180, -90),
      }),
      (pose) => {
        const cells = legacyTentClearCells(pose);
        expect(cells).toHaveLength(336);
        expect(new Set(cells.map(cellKey)).size).toBe(336);
        const f = forward(pose.yaw);
        const l = leftOf(f);
        const local = cells.map((cell) => ({
          x: Math.round((cell.x - pose.x) * l.x + (cell.z - pose.z) * l.z) + 0,
          depth:
            Math.round(-((cell.x - pose.x) * f.x + (cell.z - pose.z) * f.z)) +
            0,
          layer: cell.y - pose.y,
        }));
        const expected = [];
        for (let x = -3; x <= 3; x++)
          for (let depth = 0; depth < 12; depth++)
            for (let layer = 0; layer < 4; layer++)
              expected.push({ x, depth, layer });
        expect(local).toEqual(expected);
      },
    ),
  );
});
