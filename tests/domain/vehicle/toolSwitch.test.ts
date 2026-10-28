// The vehicle core's side of the monitor tool switch: who may use it and its cooldown (ADR 0024, 0138).
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import type { Drive } from "../../../src/domain/vehicle/drive";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { type RiderView, Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";

const driver: RiderView = {
  id: asPlayerId("d"),
  offset: defined(BULLDOZER_PROFILE.seats.positions[0], "seat 0"),
  yaw: 0,
  raw: { moveX: 0, moveY: 0, jump: false },
};

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
  it("switches only for the driver, and only on a drive with a tool", () => {
    const { v, setToolState } = vehicle();
    expect(v.switchTool(asPlayerId("outsider"), "blade_switch", 0)).toBe(false);
    expect(setToolState).not.toHaveBeenCalled();
    expect(v.switchTool(asPlayerId("d"), "blade_switch", 0)).toBe(true);
    expect(setToolState).toHaveBeenCalledExactlyOnceWith("blade_switch", "up");
    expect(
      vehicle(false).v.switchTool(asPlayerId("d"), "blade_switch", 0),
    ).toBe(false);
    const empty = vehicle(true, []);
    expect(empty.v.switchTool(asPlayerId("d"), "blade_switch", 0)).toBe(false);
    expect(empty.setToolState).not.toHaveBeenCalled();
  });

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

  it("forces the tool with no role or cooldown, and only on a drive with a tool", () => {
    const { v, setToolState } = vehicle(true, []);
    expect(v.forceTool("blade_switch", "up")).toBe(true);
    expect(v.forceTool("blade_switch", "up")).toBe(true);
    expect(setToolState).toHaveBeenCalledTimes(2);
    expect(setToolState).toHaveBeenLastCalledWith("blade_switch", "up");
    expect(vehicle(false).v.forceTool("blade_switch", "up")).toBe(false);
  });

  it("rejects an unknown item without starting the cooldown", () => {
    const { v, setToolState } = vehicle();
    expect(v.switchTool(asPlayerId("d"), "unknown", 0)).toBe(false);
    expect(setToolState).not.toHaveBeenCalled();
    expect(v.switchTool(asPlayerId("d"), "blade_switch", 1)).toBe(true);
  });
});

it("cycles a tool's declared states and shares its cooldown with other tools", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 6 }),
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
              group: "tools",
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
