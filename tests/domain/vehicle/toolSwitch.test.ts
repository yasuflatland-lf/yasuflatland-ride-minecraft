// The vehicle core's side of the monitor tool switch: who may use it and its cooldown (ADR 0024, 0138).
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import type { Drive } from "../../../src/domain/vehicle/drive";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { type RiderView, Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
import { riderView } from "../../support/riders";

const driver: RiderView = riderView("d", {
  offset: defined(BULLDOZER_PROFILE.seats.positions[0], "seat 0"),
});

function stubDrive(withTool: boolean) {
  let raised = false;
  const setToolState = vi.fn((_item: string, state: string) => {
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
    ...(withTool && {
      toolState: () => (raised ? "up" : "down"),
      setToolState,
    }),
  };
  return { drive, setToolState, raised: () => raised };
}

function vehicle(withTool = true, riders: readonly RiderView[] = [driver]) {
  const stub = stubDrive(withTool);
  const v = Vehicle.withRidersAboard(
    asVehicleId("v"),
    BULLDOZER_PROFILE,
    stub.drive,
    riders,
    0,
  );
  return { v, ...stub };
}

describe("Vehicle.switchTool (ADR 0024, 0138)", () => {
  it("switches only on a use that follows a cooldown of idle switch", () => {
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
                SPEC.toolSwitchCooldown;
            expect(v.switchTool(asPlayerId("d"), "blade_switch", t)).toBe(idle);
            if (idle) expected = !expected;
            expect(raised()).toBe(expected);
          });
        },
      ),
    );
  });

  it("a refused use from a non-driver does not restart the cooldown", () => {
    const { v } = vehicle();
    expect(v.switchTool(asPlayerId("outsider"), "blade_switch", 0)).toBe(false);
    expect(v.switchTool(asPlayerId("d"), "blade_switch", 1)).toBe(true);
  });

  it("keeps its cooldown apart from the headlight switch", () => {
    const { v } = vehicle();
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 0)).toBe(true);
    expect(v.switchTool(asPlayerId("d"), "blade_switch", 1)).toBe(true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 2)).toBe(false);
  });
});

it("cycles a tool's declared states and shares its cooldown with other tools", () => {
  fc.assert(
    fc.property(
      fc
        .uniqueArray(fc.string(), { minLength: 1, maxLength: 6 })
        .map((states) => states as [string, ...string[]]),
      fc.integer({ min: 1, max: 20 }),
      (states, cycles) => {
        const stub = stubDrive(true);
        const current = new Map<string, string>();
        stub.drive.toolState = (item) => current.get(item);
        stub.drive.setToolState = (item, state) => {
          current.set(item, state);
          return true;
        };
        const v = Vehicle.withRidersAboard(
          asVehicleId("v"),
          {
            ...BULLDOZER_PROFILE,
            monitor: {
              tools: [
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
          const tick = i * (SPEC.toolSwitchCooldown + 1);
          expect(v.switchTool(driver.id, "first", tick)).toBe(true);
          expect(current.get("first")).toBe(states[i % states.length]);
          expect(v.switchTool(driver.id, "second", tick + 1)).toBe(false);
        }
        expect(
          v.switchTool(
            driver.id,
            "second",
            states.length * cycles * (SPEC.toolSwitchCooldown + 1),
          ),
        ).toBe(true);
        expect(current.get("second")).toBe(states[0]);
      },
    ),
  );
});

it("authorizes a switch by the driver and requires a declared tool and a setter for monitor tools", () => {
  const passenger = riderView("p", {
    offset: defined(SUV_PROFILE.seats.positions[1], "seat 1"),
    seat: 1,
  });
  const tools = BULLDOZER_PROFILE.monitor?.tools ?? [];
  fc.assert(
    fc.property(
      fc.subarray([driver, passenger]),
      fc.constantFrom(driver.id, passenger.id, asPlayerId("outsider")),
      fc.constantFrom(undefined, "unknown", ...tools.map(({ item }) => item)),
      fc.boolean(),
      (crew, caller, item, withTool) => {
        const { drive, setToolState } = stubDrive(withTool);
        const v = Vehicle.withRidersAboard(
          asVehicleId("v"),
          { ...SUV_PROFILE, monitor: BULLDOZER_PROFILE.monitor },
          drive,
          crew,
          0,
        );
        const isDriver = caller === driver.id && crew.includes(driver);
        if (item === undefined) {
          expect(v.flipHeadlightSwitch(caller, 0)).toBe(isDriver);
          expect(setToolState).not.toHaveBeenCalled();
          return;
        }
        const tool = tools.find((tool) => tool.item === item);
        const switched = isDriver && tool !== undefined && withTool;
        expect(v.switchTool(caller, item, 0)).toBe(switched);
        if (switched) {
          const next =
            tool.states[tool.states.indexOf("down") + 1] ?? tool.states[0];
          expect(setToolState).toHaveBeenCalledExactlyOnceWith(item, next);
        } else {
          expect(setToolState).not.toHaveBeenCalled();
          if (crew.includes(driver) && withTool)
            expect(v.switchTool(driver.id, "blade_switch", 1)).toBe(true);
        }
      },
    ),
  );
});

it("forces a tool regardless of crew or cooldown when the drive has a setter", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.array(fc.constantFrom("up", "down"), { minLength: 2 }),
      (withTool, driverPresent, states) => {
        const { v, setToolState } = vehicle(
          withTool,
          driverPresent ? [driver] : [],
        );
        for (const state of states)
          expect(v.forceTool("blade_switch", state)).toBe(withTool);
        expect(setToolState.mock.calls).toEqual(
          withTool ? states.map((state) => ["blade_switch", state]) : [],
        );
      },
    ),
  );
});
