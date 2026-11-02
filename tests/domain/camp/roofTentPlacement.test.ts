import fc from "fast-check";
import { expect, it } from "vitest";
import { planRoofTent } from "../../../src/domain/camp/roofTent/placement";
import type { RoofTentMount } from "../../../src/domain/shared/roofTent";

const mountArb: fc.Arbitrary<RoofTentMount> = fc.record({
  roofHeight: fc.double({ min: 0, max: 5, noNaN: true }),
  anchor: fc.record({
    x: fc.double({ noNaN: true }),
    z: fc.double({ noNaN: true }),
  }),
  ladder: fc.boolean(),
  entrance: fc.record({
    x: fc.double({ noNaN: true }),
    z: fc.double({ noNaN: true }),
  }),
});
const yawArb = fc.double({ min: -1e4, max: 1e4, noNaN: true });

it("plans a free roof on a supported vehicle with the mount's ladder", () => {
  fc.assert(
    fc.property(fc.string(), mountArb, yawArb, (id, mount, yaw) => {
      const plan = planRoofTent({
        target: { type: "vehicle", id, mount, roofTaken: false },
        yaw,
      });
      expect(plan).toMatchObject({
        host: { kind: "vehicle", id },
        ladder: mount.ladder,
      });
    }),
  );
});

it("refuses a taken roof", () => {
  fc.assert(
    fc.property(fc.string(), mountArb, yawArb, (id, mount, yaw) => {
      expect(
        planRoofTent({
          target: { type: "vehicle", id, mount, roofTaken: true },
          yaw,
        }),
      ).toBe("roof_taken");
    }),
  );
});

it("refuses a vehicle without a mount, taken roof or not", () => {
  for (const roofTaken of [false, true]) {
    expect(
      planRoofTent({
        target: { type: "vehicle", id: "a", mount: undefined, roofTaken },
        yaw: 0,
      }),
    ).toBe("unsupported_vehicle");
  }
});

it("plans on the ground iff it is clear, without a ladder", () => {
  fc.assert(
    fc.property(fc.boolean(), yawArb, (clear, yaw) => {
      const plan = planRoofTent({ target: { type: "ground", clear }, yaw });
      if (clear) {
        expect(plan).toMatchObject({ host: { kind: "ground" }, ladder: false });
      } else {
        expect(plan).toBe("blocked");
      }
    }),
  );
});
