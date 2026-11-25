import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import type { Drive } from "../../../../src/domain/vehicle/drive";
import { BULLDOZER_PROFILE } from "../../../../src/domain/vehicle/kinds/bulldozer/profile";
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

function stubDrive(withEquipment: boolean) {
  let raised = false;
  const setEquipmentState = vi.fn((_item: string, state: string) => {
    raised = state === "up";
    return true;
  });
  const drive: Drive = {
    speed: 0,
    yaw: 0,
    resync() {},
    onDriverMounted() {},
    onSeatVacated: () => [],
    step: () => {
      throw new Error("not stepped");
    },
    ...(withEquipment && {
      equipmentState: () => (raised ? "up" : "down"),
      setEquipmentState,
    }),
  };
  return { drive, setEquipmentState, raised: () => raised };
}

function vehicle(
  withEquipment = true,
  riders: readonly RiderView[] = [driver],
) {
  const stub = stubDrive(withEquipment);
  const v = Vehicle.withRidersAboard(
    asVehicleId("v"),
    BULLDOZER_PROFILE,
    stub.drive,
    riders,
    0,
  );
  return { v, ...stub };
}

describe("Vehicle.switchEquipment (ADR 0024, 0138)", () => {
  it("switches only on a use that follows a full idle cooldown", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.integer({ min: 0, max: 200 }))
          .map((t) => t.sort((a, b) => a - b)),
        (ticks) => {
          const { v, raised } = vehicle();
          let expected = false;
          ticks.forEach((t, i) => {
            const idle =
              i === 0 ||
              t - defined(ticks[i - 1], "previous use") >=
                SPEC.equipmentSwitchCooldown;
            expect(v.switchEquipment(asPlayerId("d"), "blade_switch", t)).toBe(
              idle,
            );
            if (idle) expected = !expected;
            expect(raised()).toBe(expected);
          });
        },
      ),
    );
  });

  it("a refused use from a non-driver does not restart the cooldown", () => {
    const { v } = vehicle();
    expect(v.switchEquipment(asPlayerId("outsider"), "blade_switch", 0)).toBe(
      false,
    );
    expect(v.switchEquipment(asPlayerId("d"), "blade_switch", 1)).toBe(true);
  });

  it("keeps its cooldown apart from the headlight switch", () => {
    const { v } = vehicle();
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 0)).toBe(true);
    expect(v.switchEquipment(asPlayerId("d"), "blade_switch", 1)).toBe(true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 2)).toBe(false);
  });
});

it("cycles a switch's declared states and shares its cooldown with other switches", () => {
  fc.assert(
    fc.property(
      fc
        .uniqueArray(fc.string(), { minLength: 1, maxLength: 6 })
        .map((states) => states as [string, ...string[]]),
      fc.integer({ min: 1, max: 20 }),
      (states, cycles) => {
        const stub = stubDrive(true);
        const current = new Map<string, string>();
        stub.drive.equipmentState = (item) => current.get(item);
        stub.drive.setEquipmentState = (item, state) => {
          current.set(item, state);
          return true;
        };
        const v = Vehicle.withRidersAboard(
          asVehicleId("v"),
          {
            ...BULLDOZER_PROFILE,
            equipment: {
              switches: [
                { item: "first", states },
                { item: "second", states },
              ],
            },
          },
          stub.drive,
          [driver],
          0,
        );
        for (let i = 0; i < states.length * cycles; i++) {
          const tick = i * (SPEC.equipmentSwitchCooldown + 1);
          expect(v.switchEquipment(driver.id, "first", tick)).toBe(true);
          expect(current.get("first")).toBe(states[i % states.length]);
          expect(v.switchEquipment(driver.id, "second", tick + 1)).toBe(false);
        }
        expect(
          v.switchEquipment(
            driver.id,
            "second",
            states.length * cycles * (SPEC.equipmentSwitchCooldown + 1),
          ),
        ).toBe(true);
        expect(current.get("second")).toBe(states[0]);
      },
    ),
  );
});

it("authorizes a switch by the driver and requires a declared equipment switch and a setter", () => {
  const passenger = riderView("p", {
    offset: defined(SUV_PROFILE.seats.positions[1], "seat 1"),
    seat: 1,
  });
  const switches = BULLDOZER_PROFILE.equipment?.switches ?? [];
  fc.assert(
    fc.property(
      fc.subarray([driver, passenger]),
      fc.constantFrom(driver.id, passenger.id, asPlayerId("outsider")),
      fc.constantFrom(
        undefined,
        "unknown",
        ...switches.map(({ item }) => item),
      ),
      fc.boolean(),
      (crew, caller, item, withEquipment) => {
        const { drive, setEquipmentState } = stubDrive(withEquipment);
        const v = Vehicle.withRidersAboard(
          asVehicleId("v"),
          { ...SUV_PROFILE, equipment: BULLDOZER_PROFILE.equipment },
          drive,
          crew,
          0,
        );
        const isDriver = caller === driver.id && crew.includes(driver);
        if (item === undefined) {
          expect(v.flipHeadlightSwitch(caller, 0)).toBe(isDriver);
          expect(setEquipmentState).not.toHaveBeenCalled();
          return;
        }
        const equipmentSwitch = switches.find(
          (equipmentSwitch) => equipmentSwitch.item === item,
        );
        const switched =
          isDriver && equipmentSwitch !== undefined && withEquipment;
        expect(v.switchEquipment(caller, item, 0)).toBe(switched);
        if (switched) {
          const next =
            equipmentSwitch.states[
              equipmentSwitch.states.indexOf("down") + 1
            ] ?? equipmentSwitch.states[0];
          expect(setEquipmentState).toHaveBeenCalledExactlyOnceWith(item, next);
        } else {
          expect(setEquipmentState).not.toHaveBeenCalled();
          if (crew.includes(driver) && withEquipment)
            expect(v.switchEquipment(driver.id, "blade_switch", 1)).toBe(true);
        }
      },
    ),
  );
});

it("forces equipment state regardless of crew or cooldown when the drive has a setter", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.array(fc.constantFrom("up", "down"), { minLength: 2 }),
      (withEquipment, driverPresent, states) => {
        const { v, setEquipmentState } = vehicle(
          withEquipment,
          driverPresent ? [driver] : [],
        );
        for (const state of states)
          expect(v.forceEquipment("blade_switch", state)).toBe(withEquipment);
        expect(setEquipmentState.mock.calls).toEqual(
          withEquipment ? states.map((state) => ["blade_switch", state]) : [],
        );
      },
    ),
  );
});
