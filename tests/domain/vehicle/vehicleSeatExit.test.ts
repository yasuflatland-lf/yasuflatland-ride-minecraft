import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { forward } from "../../../src/domain/shared/vec";
import type { Drive } from "../../../src/domain/vehicle/drive";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { toLocal } from "../../../src/domain/vehicle/seats";
import {
  type RiderView,
  Vehicle,
  type VehicleTickInput,
} from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";

const finite = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const point = fc.record({
  x: finite(-10000, 10000),
  y: finite(-64, 320),
  z: finite(-10000, 10000),
});
const exitPoint = fc.record({ x: finite(-3, 3), z: finite(-3, 3) });

it("places only leaving riders at the configured exit in the post-step frame", () => {
  fc.assert(
    fc.property(
      finite(-180, 179.999999),
      point,
      exitPoint,
      fc.boolean(),
      (yaw, location, exit, held) => {
        let driveYaw = 0;
        const drive: Drive = {
          speed: 0,
          get yaw() {
            return driveYaw;
          },
          resync() {},
          onDriverMounted() {},
          onSeatVacated: () => [],
          step(_raw, sensors) {
            driveYaw = sensors.tick === 3 ? yaw : 0;
            return {
              impulse: { x: 1, y: 0, z: 1 },
              forward: forward(yaw),
              commands: [],
              riders: { thirdPerson: false, underwater: false },
              ...(held
                ? {
                    dock: {
                      hold: { ...location, yaw: 0 },
                      cells: [],
                      seats: [],
                    },
                  }
                : {}),
            };
          },
        };
        const rider: RiderView = {
          id: asPlayerId("driver"),
          offset: { x: 0, z: 0 },
          slot: 0,
          yaw,
          raw: { moveX: 0, moveY: 0, jump: false },
        };
        const input = (
          tick: number,
          riders: readonly RiderView[],
        ): VehicleTickInput => ({
          tick,
          riders,
          location: held ? { x: 123, y: 20, z: 456 } : location,
          velocity: { x: 0, y: 0, z: 0 },
          onGround: true,
          deckSeatInputs: [],
          waterAt: () => false,
          solidAt: () => false,
          blockTypes: () => [],
          targets: () => [],
        });
        for (const configured of [true, false]) {
          const profile = {
            ...SUV_PROFILE,
            seats: { positions: [{ x: 0, z: 0 }] },
            ...(configured ? { seatExits: [exit] } : {}),
          };
          const vehicle = new Vehicle(asVehicleId("car"), profile, drive);
          expect(vehicle.tick(input(0, [])).exits).toEqual([]);
          expect(vehicle.tick(input(1, [rider])).exits).toEqual([]);
          expect(vehicle.tick(input(2, [rider])).exits).toEqual([]);
          const out = vehicle.tick(input(3, []));
          if (configured) {
            expect(out.exits).toHaveLength(1);
            const actual = defined(out.exits[0], "exit");
            expect(actual.playerId).toBe(rider.id);
            expect(actual.at.y).toBe(location.y);
            const local = toLocal(
              { x: actual.at.x - location.x, z: actual.at.z - location.z },
              forward(out.yaw),
            );
            expect(Math.abs(local.x - exit.x)).toBeLessThan(1e-9);
            expect(Math.abs(local.z - exit.z)).toBeLessThan(1e-9);
          } else expect(out.exits).toEqual([]);
          expect(vehicle.tick(input(4, [])).exits).toEqual([]);
        }
      },
    ),
  );
});
