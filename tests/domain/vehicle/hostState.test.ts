import fc from "fast-check";
import { expect, it } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { hostStateFrom } from "../../../src/domain/vehicle/hostState";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import { DRIVER_SEAT } from "../../../src/domain/vehicle/seats";
import { SPEC } from "../../../src/domain/vehicle/spec";

const origin = { x: 0, y: 0, z: 0 };
const parked = { location: origin, yaw: 0, velocity: origin, riders: [] };

const dimension = asDimensionId("minecraft:overworld");
const profile = profileOf("suv");
const finite = fc.double({ min: -1000, max: 1000, noNaN: true });

it("reports a driver iff a rider occupies the driver slot, regardless of deck riders", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 10 })),
      fc.array(fc.string()),
      (slots, deck) => {
        const snapshot = {
          ...parked,
          riders: slots.map((slot) => ({ slot })),
          deckSeatRiders: deck.map(asPlayerId),
        };
        expect(hostStateFrom(snapshot, profile, dimension).driverPresent).toBe(
          slots.includes(DRIVER_SEAT),
        );
        expect(
          hostStateFrom({ ...snapshot, riders: [] }, profile, dimension)
            .driverPresent,
        ).toBe(false);
      },
    ),
  );
});

it("is monotonic across the horizontal threshold and ignores vertical speed", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: SPEC.hostMovingSpeed, noNaN: true }),
      fc.double({ min: SPEC.hostMovingSpeed + 1e-9, max: 10, noNaN: true }),
      finite,
      fc.boolean(),
      fc.boolean(),
      (low, high, y, useX, negative) => {
        const moving = (speed: number) =>
          hostStateFrom(
            {
              ...parked,
              velocity: { x: useX ? speed : 0, y, z: useX ? 0 : speed },
            },
            profile,
            dimension,
          ).moving;
        const sign = negative ? -1 : 1;
        expect(moving(low * sign)).toBe(false);
        expect(moving(SPEC.hostMovingSpeed * sign)).toBe(false);
        expect(moving(high * sign)).toBe(true);
      },
    ),
  );
});

it("uses both horizontal velocity components", () => {
  fc.assert(
    fc.property(finite, finite, finite, (x, y, z) => {
      expect(
        hostStateFrom({ ...parked, velocity: { x, y, z } }, profile, dimension)
          .moving,
      ).toBe(Math.hypot(x, z) > SPEC.hostMovingSpeed);
    }),
  );
});

it("copies the pose, dimension and each kind's optional roof mount", () => {
  fc.assert(
    fc.property(
      fc.record({ x: finite, y: finite, z: finite }),
      finite,
      fc.string(),
      fc.constantFrom(...VEHICLE_KINDS),
      (location, yaw, dim, kind) => {
        const selected = profileOf(kind);
        const state = hostStateFrom(
          { ...parked, location, yaw },
          selected,
          asDimensionId(dim),
        );
        expect(state).toMatchObject({
          status: "present",
          location,
          yaw,
          dimensionId: dim,
        });
        expect(state.mount).toBe(selected.roofTent);
        expect(
          hostStateFrom(parked, { ...selected, roofTent: undefined }, dimension)
            .mount,
        ).toBeUndefined();
      },
    ),
  );
});
