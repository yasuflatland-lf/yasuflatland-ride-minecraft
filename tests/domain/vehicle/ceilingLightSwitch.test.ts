// The vehicle core's side of the ceiling light switch: who may use it and its cooldown (ADR 0024, 0115).
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import type { Drive } from "../../../src/domain/vehicle/drive";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { type RiderView, Vehicle } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";

const FEET: Vec3 = { x: 0.5, y: 65, z: 0.5 };
const driver: RiderView = {
  id: asPlayerId("d"),
  offset: defined(CAMPER_PROFILE.seats.positions[0], "seat 0"),
  yaw: 0,
  raw: { moveX: 0, moveY: 0, jump: false },
};

function vehicle(
  switchCeilingLights?: (feet: Vec3) => boolean,
  ceilingLightsReachable?: (feet: Vec3) => boolean,
) {
  const drive: Drive = {
    speed: 0,
    yaw: 0,
    onDriverMounted() {},
    onSeatVacated: () => [],
    step: () => {
      throw new Error("not stepped");
    },
    ...(switchCeilingLights && { switchCeilingLights }),
    ...(ceilingLightsReachable && { ceilingLightsReachable }),
  };
  return Vehicle.withRidersAboard(
    asVehicleId("v"),
    CAMPER_PROFILE,
    drive,
    [driver],
    0,
  );
}

describe("Vehicle.switchCeilingLights (ADR 0115)", () => {
  it("passes the feet of anyone but the driver to the drive", () => {
    const flip = vi.fn(() => true);
    const v = vehicle(flip);
    expect(v.switchCeilingLights(asPlayerId("d"), FEET, 0)).toBe(false);
    expect(flip).not.toHaveBeenCalled();
    expect(v.switchCeilingLights(asPlayerId("p"), FEET, 0)).toBe(true);
    expect(flip).toHaveBeenCalledExactlyOnceWith(FEET);
  });

  it("tells whether a use reaches the lights only for anyone but the driver, from where the drive allows, without using the cooldown", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom("d", "p"),
        (reachable, player) => {
          const flip = vi.fn(() => true);
          const v = vehicle(flip, () => reachable);
          expect(v.canSwitchCeilingLights(asPlayerId(player), FEET)).toBe(
            reachable && player !== "d",
          );
          expect(flip).not.toHaveBeenCalled();
          expect(v.switchCeilingLights(asPlayerId("p"), FEET, 0)).toBe(true);
        },
      ),
    );
    expect(vehicle().canSwitchCeilingLights(asPlayerId("p"), FEET)).toBe(false);
  });

  it("does nothing for a kind without ceiling lights", () => {
    expect(vehicle().switchCeilingLights(asPlayerId("p"), FEET, 0)).toBe(false);
  });

  it("flips only on a use that follows the headlight switch's cooldown of idle switch, whoever uses it", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(
            fc.record({
              tick: fc.integer({ min: 0, max: 200 }),
              player: fc.constantFrom("a", "b"),
            }),
            { selector: (u) => u.tick },
          )
          .map((uses) => uses.sort((x, y) => x.tick - y.tick)),
        (uses) => {
          const v = vehicle(() => true);
          uses.forEach(({ tick, player }, i) => {
            const idle =
              i === 0 ||
              tick - defined(uses[i - 1], "previous use").tick >=
                SPEC.headlightSwitchCooldown;
            expect(v.switchCeilingLights(asPlayerId(player), FEET, tick)).toBe(
              idle,
            );
          });
        },
      ),
    );
  });

  it("keeps its cooldown apart from the driver's headlight switch", () => {
    const v = vehicle(() => true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 0)).toBe(true);
    expect(v.switchCeilingLights(asPlayerId("p"), FEET, 1)).toBe(true);
    expect(v.flipHeadlightSwitch(asPlayerId("d"), 2)).toBe(false);
  });
});
