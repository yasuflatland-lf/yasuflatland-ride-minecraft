import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import type { Drive } from "../../../../src/domain/vehicle/drive";
import { BulldozerDrive } from "../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH,
  WIDE_BLADE_SWITCH,
} from "../../../../src/domain/vehicle/kinds/bulldozer/equipment";
import { BULLDOZER_PROFILE } from "../../../../src/domain/vehicle/kinds/bulldozer/profile";
import { ICEBREAKER_SWITCH } from "../../../../src/domain/vehicle/kinds/sportsboat/equipment";
import { SUV_PROFILE } from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import {
  type RiderView,
  Vehicle,
} from "../../../../src/domain/vehicle/vehicle";
import { defined } from "../../../support/defined";
import { riderView } from "../../../support/riders";

const driver: RiderView = riderView("d", {
  offset: defined(BULLDOZER_PROFILE.seats.positions[0], "seat 0"),
});

const driveWithoutEquipment: Drive = {
  speed: 0,
  yaw: 0,
  resync() {},
  onDriverMounted() {},
  onSeatVacated: () => [],
  step: () => {
    throw new Error("not stepped");
  },
};

function vehicle(riders: readonly RiderView[] = [driver]) {
  return Vehicle.withRidersAboard(
    asVehicleId("v"),
    BULLDOZER_PROFILE,
    new BulldozerDrive(0, { blade: 0 }),
    riders,
    0,
  );
}

describe("Vehicle.switchEquipment (ADR 0024, 0138)", () => {
  it("switches only on a use that follows a full idle cooldown", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.integer({ min: 0, max: 200 }))
          .map((t) => t.sort((a, b) => a - b)),
        (ticks) => {
          const v = vehicle();
          let expected = false;
          ticks.forEach((t, i) => {
            const idle =
              i === 0 ||
              t - defined(ticks[i - 1], "previous use") >=
                SPEC.equipmentSwitchCooldown;
            expect(v.switchEquipment(asPlayerId("d"), BLADE_SWITCH, t)).toBe(
              idle,
            );
            if (idle) expected = !expected;
            expect(v.equipmentState(BLADE_SWITCH)).toBe(
              expected ? "up" : "down",
            );
          });
        },
      ),
    );
  });

  it("a refused use from a non-driver does not restart the cooldown", () => {
    const v = vehicle();
    expect(v.switchEquipment(asPlayerId("outsider"), BLADE_SWITCH, 0)).toBe(
      false,
    );
    expect(v.switchEquipment(asPlayerId("d"), BLADE_SWITCH, 1)).toBe(true);
  });

  it("keeps its cooldown apart from the headlight switch", () => {
    const v = vehicle();
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 0)).toBe(true);
    expect(v.switchEquipment(asPlayerId("d"), BLADE_SWITCH, 1)).toBe(true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 2)).toBe(false);
  });
});

it("shares the cooldown across the vehicle's switches", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 200 }), (tick) => {
      const v = vehicle();
      expect(v.switchEquipment(driver.id, BLADE_SWITCH, tick)).toBe(true);
      expect(v.switchEquipment(driver.id, WIDE_BLADE_SWITCH, tick + 1)).toBe(
        false,
      );
      expect(v.equipmentState(WIDE_BLADE_SWITCH)).toBe("normal");
      expect(
        v.switchEquipment(
          driver.id,
          WIDE_BLADE_SWITCH,
          tick + 1 + SPEC.equipmentSwitchCooldown,
        ),
      ).toBe(true);
      expect(v.equipmentState(WIDE_BLADE_SWITCH)).toBe("wide");
    }),
  );
});

it("requires the driver, a switch declared by the kind, and a drive that can cycle it", () => {
  const passenger = riderView("p", {
    offset: defined(SUV_PROFILE.seats.positions[1], "seat 1"),
    seat: 1,
  });
  fc.assert(
    fc.property(
      fc.subarray([driver, passenger]),
      fc.constantFrom(driver.id, passenger.id, asPlayerId("outsider")),
      fc.constantFrom(BLADE_SWITCH, ICEBREAKER_SWITCH),
      fc.boolean(),
      (crew, caller, equipmentSwitch, withEquipment) => {
        const v = Vehicle.withRidersAboard(
          asVehicleId("v"),
          { ...BULLDOZER_PROFILE, seats: SUV_PROFILE.seats },
          withEquipment
            ? new BulldozerDrive(0, { blade: 0 })
            : driveWithoutEquipment,
          crew,
          0,
        );
        const switched =
          caller === driver.id &&
          crew.includes(driver) &&
          equipmentSwitch === BLADE_SWITCH &&
          withEquipment;
        expect(v.switchEquipment(caller, equipmentSwitch, 0)).toBe(switched);
        if (withEquipment) {
          expect(v.equipmentState(BLADE_SWITCH)).toBe(switched ? "up" : "down");
          if (!switched && crew.includes(driver))
            expect(v.switchEquipment(driver.id, BLADE_SWITCH, 1)).toBe(true);
        }
      },
    ),
  );
});

it("forces only declared equipment states with or without a driver or cooldown", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.array(fc.oneof(fc.string(), fc.constantFrom("up", "down")), {
        minLength: 2,
      }),
      (driverPresent, states) => {
        const v = vehicle(driverPresent ? [driver] : []);
        if (driverPresent)
          expect(v.switchEquipment(driver.id, BLADE_SWITCH, 0)).toBe(true);
        let expected = driverPresent ? "up" : "down";
        for (const state of states) {
          const valid = state === "up" || state === "down";
          expect(v.forceEquipment(BLADE_SWITCH, state)).toBe(valid);
          if (valid) expected = state;
          expect(v.equipmentState(BLADE_SWITCH)).toBe(expected);
        }
      },
    ),
  );
});
