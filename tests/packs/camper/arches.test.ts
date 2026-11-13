import { describe, expect, it } from "vitest";
import { bones, swatch } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("clears furniture and wall lining from all four wheel housings", () => {
    const interior = bones.filter(
      (b) => b.name === "body" || b.name.startsWith("seat_"),
    );
    for (const [x0, x1] of [
      [18.3, 23],
      [-23, -18.3],
    ]) {
      for (const axle of [-31.5, 31]) {
        const low = [x0, -99, axle - 10.3 - 0.3];
        const high = [x1, 18.4, axle + 10.3 + 0.3];
        for (const b of interior) {
          for (const cube of b.cubes ?? []) {
            if (swatch(cube, "black") || swatch(cube, "wood")) continue;
            const overlaps = cube.origin.every(
              (start, axis) =>
                start < (high[axis] ?? 0) - 0.001 &&
                start + (cube.size[axis] ?? 0) > (low[axis] ?? 0) + 0.001,
            );
            expect(overlaps, `${b.name}: ${cube.origin}`).toBe(false);
          }
        }
      }
    }
  });
});
