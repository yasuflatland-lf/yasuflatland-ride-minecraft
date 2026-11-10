import fc from "fast-check";
import { expect, it } from "vitest";
import {
  degreesOf,
  NO_TURN,
  nextQuarterTurn,
  type QuarterTurn,
  rotatedSize,
} from "../../../src/domain/build/rotation/quarterTurn";

const turn = fc.constantFrom<QuarterTurn>(0, 1, 2, 3);
const dimension = fc.integer({ min: 1, max: 1024 });
const size = fc.record({ x: dimension, y: dimension, z: dimension });

it("cycles through all four turns before returning to the start", () => {
  expect(NO_TURN).toBe(0);
  fc.assert(
    fc.property(turn, (start) => {
      let current = start;
      const visited = new Set<QuarterTurn>();
      for (let i = 0; i < 4; i++) {
        visited.add(current);
        expect(degreesOf(current)).toBe(90 * current);
        const next = nextQuarterTurn(current);
        expect(next).toBe((current + 1) % 4);
        current = next;
      }
      expect(visited.size).toBe(4);
      expect(current).toBe(start);
    }),
  );
});

it("swaps only the horizontal dimensions on odd turns and preserves volume", () => {
  fc.assert(
    fc.property(size, turn, (dimensions, turn) => {
      const original = { ...dimensions };
      const result = rotatedSize(Object.freeze(dimensions), turn);
      expect(result).toEqual({
        x: turn % 2 === 0 ? dimensions.x : dimensions.z,
        y: dimensions.y,
        z: turn % 2 === 0 ? dimensions.z : dimensions.x,
      });
      expect(result.x * result.y * result.z).toBe(
        dimensions.x * dimensions.y * dimensions.z,
      );
      expect(rotatedSize(result, turn)).toEqual(original);
      expect(dimensions).toEqual(original);
      expect(Object.isFrozen(result)).toBe(true);
    }),
  );
});
