// The vehicle core's side of the blade switch: who may use it and its cooldown (ADR 0024, 0138).
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { LIGHT_SWITCH_COOLDOWN_TICKS } from "../../../src/domain/shared/switchCooldown";
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

function stubDrive(withBlade: boolean) {
  let raised = false;
  const setBlade = vi.fn((value: boolean) => {
    raised = value;
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
    ...(withBlade && { bladeRaised: () => raised, setBlade }),
  };
  return { drive, setBlade, raised: () => raised };
}

function vehicle(withBlade = true, riders: readonly RiderView[] = [driver]) {
  const stub = stubDrive(withBlade);
  const v = Vehicle.withRidersAboard(
    asVehicleId("v"),
    BULLDOZER_PROFILE,
    stub.drive,
    riders,
    0,
  );
  return { v, ...stub };
}

describe("Vehicle.switchBlade (ADR 0024, 0138)", () => {
  it("switches only for the driver, and only on a drive with a blade", () => {
    const { v, setBlade } = vehicle();
    expect(v.switchBlade(asPlayerId("outsider"), 0)).toBe(false);
    expect(setBlade).not.toHaveBeenCalled();
    expect(v.switchBlade(asPlayerId("d"), 0)).toBe(true);
    expect(setBlade).toHaveBeenCalledExactlyOnceWith(true);
    expect(vehicle(false).v.switchBlade(asPlayerId("d"), 0)).toBe(false);
    const empty = vehicle(true, []);
    expect(empty.v.switchBlade(asPlayerId("d"), 0)).toBe(false);
    expect(empty.setBlade).not.toHaveBeenCalled();
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
                SPEC.bladeSwitchCooldown;
            expect(v.switchBlade(asPlayerId("d"), t)).toBe(idle);
            if (idle) expected = !expected;
            expect(raised()).toBe(expected);
          });
        },
      ),
    );
  });

  it("a refused use from a non-driver does not restart the cooldown", () => {
    const { v } = vehicle();
    expect(v.switchBlade(asPlayerId("outsider"), 0)).toBe(false);
    expect(v.switchBlade(asPlayerId("d"), 1)).toBe(true);
  });

  it("keeps its cooldown apart from the headlight switch", () => {
    const { v } = vehicle();
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 0)).toBe(true);
    expect(v.switchBlade(asPlayerId("d"), 1)).toBe(true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 2)).toBe(false);
  });

  it("forces the blade with no role or cooldown, and only on a drive with a blade", () => {
    const { v, setBlade } = vehicle(true, []);
    expect(v.forceBlade(true)).toBe(true);
    expect(v.forceBlade(true)).toBe(true);
    expect(setBlade).toHaveBeenCalledTimes(2);
    expect(setBlade).toHaveBeenLastCalledWith(true);
    expect(vehicle(false).v.forceBlade(true)).toBe(false);
  });

  it("uses the headlight switch's duration", () => {
    expect(SPEC.bladeSwitchCooldown).toBe(LIGHT_SWITCH_COOLDOWN_TICKS);
  });
});
