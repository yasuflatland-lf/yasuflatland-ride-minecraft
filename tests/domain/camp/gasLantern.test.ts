import fc from "fast-check";
import { expect, it } from "vitest";
import { gasLanternLightCells } from "../../../src/domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../src/domain/camp/spec";

const coordinate = fc.double({ min: -100000, max: 100000, noNaN: true });
const location = fc.record({ x: coordinate, y: coordinate, z: coordinate });

it("lays no light while off and exactly one full-bright cell while lit", () => {
  fc.assert(
    fc.property(location, (at) => {
      expect(gasLanternLightCells(false, at)).toEqual([]);
      expect(gasLanternLightCells(true, at)).toEqual([
        {
          x: Math.floor(at.x),
          y: Math.floor(at.y + GAS_LANTERN_SPEC.lightLift),
          z: Math.floor(at.z),
          block: { level: 15 },
        },
      ]);
    }),
  );
});

it("lights its own cell on full blocks and the air above partial block tops", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -64, max: 320 }),
      fc.integer({ min: 0, max: 9400 }),
      (n, height) => {
        const h = height / 10000;
        expect(gasLanternLightCells(true, { x: 0, y: n + h, z: 0 })[0]?.y).toBe(
          n + (h < 0.05 ? 0 : 1),
        );
      },
    ),
  );
});
