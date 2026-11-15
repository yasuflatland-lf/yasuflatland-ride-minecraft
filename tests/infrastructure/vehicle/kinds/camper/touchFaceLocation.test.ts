import fc from "fast-check";
import { expect, it } from "vitest";
import { touchCorrectedFaceLocation } from "../../../../../src/infrastructure/vehicle/kinds/camper/touchFaceLocation";

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const location = fc.record({ x: unit, y: unit, z: unit });

it("corrects touch world-axis x and y while preserving z", () => {
  fc.assert(
    fc.property(location, (at) => {
      expect(touchCorrectedFaceLocation(at, "Touch")).toEqual({
        x: 1 - at.x,
        y: 1 - at.y,
        z: at.z,
      });
    }),
  );
});
it("preserves every other input mode including an unknown mode", () => {
  fc.assert(
    fc.property(
      location,
      fc.option(
        fc.string().filter((s) => s !== "Touch"),
        { nil: undefined },
      ),
      (at, mode) => {
        expect(touchCorrectedFaceLocation(at, mode)).toEqual(at);
      },
    ),
  );
  for (const mode of ["KeyboardAndMouse", "Gamepad", undefined]) {
    expect(
      touchCorrectedFaceLocation({ x: 0, y: 4.679 / 16, z: 1 }, mode),
    ).toEqual({ x: 0, y: 4.679 / 16, z: 1 });
  }
});
it("is an involution within floating point precision", () => {
  fc.assert(
    fc.property(location, (at) => {
      const twice = touchCorrectedFaceLocation(
        touchCorrectedFaceLocation(at, "Touch"),
        "Touch",
      );
      expect(twice.x).toBeCloseTo(at.x, 15);
      expect(twice.y).toBeCloseTo(at.y, 15);
      expect(twice.z).toBe(at.z);
    }),
  );
});
it.each([
  ["t1", 0.083, 0.207, true],
  ["t2", 0.974, 0.921, false],
  ["t3", 0.089, 0.447, true],
  ["t4", 0.954, 0.392, false],
  ["t5", 0.54, 0.021, false],
] as const)(
  "replays wool %s at (%s,%s) with east/left half=%s when facing +z",
  (_tap, x, z, east) => {
    const corrected = touchCorrectedFaceLocation({ x, y: 0, z }, "Touch");
    expect(corrected.x > 0.5).toBe(east);
    expect(corrected.y).toBe(1);
    expect(corrected.z).toBe(z);
  },
);
