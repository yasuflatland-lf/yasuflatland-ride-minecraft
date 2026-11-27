import fc from "fast-check";
import { expect, it } from "vitest";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { classifyTap } from "../../../src/domain/build/flow/tapConfirm";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";

const dim = asDimensionId("minecraft:overworld");
const otherDim = asDimensionId("minecraft:nether");
const axis = fc.integer({ min: -100, max: 100 });
const cells = fc.record({ x: axis, y: axis, z: axis }).map(cellOf);

it("sets the first goal or a different cell or dimension at any press gap", () => {
  fc.assert(
    fc.property(cells, fc.nat(), (cell, gap) => {
      const tap = blockTapOf(dim, cell);
      for (const current of [
        undefined,
        blockTapOf(otherDim, cell),
        blockTapOf(dim, cellOf({ ...cell, x: cell.x + 1 })),
      ]) {
        expect(classifyTap(current, tap, gap)).toBe("set");
      }
    }),
  );
});

it("ignores the face and confirms a repeat only after eight quiet ticks", () => {
  fc.assert(
    fc.property(cells, fc.nat(), (cell, extraTicks) => {
      const current = blockTapOf(dim, cell, "up");
      const tap = blockTapOf(dim, cellOf({ ...cell }), "north");
      expect(classifyTap(current, tap, Math.min(extraTicks, 8))).toBe("ignore");
      expect(classifyTap(current, tap, 8)).toBe("ignore");
      expect(classifyTap(current, tap, 9)).toBe("confirm");
      expect(classifyTap(current, tap, 9 + extraTicks)).toBe("confirm");
    }),
  );
});
