import fc from "fast-check";
import { expect, it } from "vitest";
import { asVehicleId, type PlayerId } from "../../../src/domain/shared/ids";
import {
  VEHICLE_KINDS,
  type VehicleKind,
} from "../../../src/domain/vehicle/kind";
import { CAMPER_MOTION } from "../../../src/domain/vehicle/kinds/camper/profile";
import {
  createVehicle,
  entityContractOf,
  profileOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_MOTION } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SUV_MOTION } from "../../../src/domain/vehicle/kinds/suv/profile";
import type { MotionLimits } from "../../../src/domain/vehicle/motion/limits";
import { expectDeclaredCommand } from "../../support/entityContract";
import { riderId, riderViews, tickSamples } from "../../support/vehicleFuzz";
import { waterSensors } from "../../support/waterDepth";

const LIMITS: Record<VehicleKind, MotionLimits> = {
  suv: SUV_MOTION,
  camper: CAMPER_MOTION,
  sportsboat: SPORTSBOAT_MOTION,
};

const EPSILON = 1e-9;

it.each(VEHICLE_KINDS)(
  "keeps speed, heading, driver, seats and entity commands valid over random rides for %s (ADR 0010, 0019, 0055)",
  (kind) => {
    const profile = profileOf(kind);
    const contract = entityContractOf(kind);
    const limits = LIMITS[kind];
    const chosen = profile.boarding.order === "chosen";
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        tickSamples(kind, 60),
        (yaw, samples) => {
          const vehicle = createVehicle(kind, asVehicleId("v"), yaw);
          let lastRiders = new Set<PlayerId>();
          let lastDriver: PlayerId | undefined;
          samples.forEach((s, tick) => {
            const riders = riderViews(kind, s.riders, vehicle.yaw);
            const ids = new Set(riders.map((r) => r.id));
            const out = vehicle.tick({
              tick,
              riders,
              testInput: s.testInput,
              deckSeatInputs: s.deckSeatInputs,
              ...(chosen ? { deckSeatRiders: [] } : {}),
              velocity: s.velocity,
              onGround: s.onGround,
              ...waterSensors(s.depth, s.below),
              blockTypes: (cells) => cells.map(() => "minecraft:air"),
              solidAt: () => s.solid,
              targets: () => [],
            });

            expect(vehicle.speed).toBeGreaterThanOrEqual(
              -limits.maxReverse - EPSILON,
            );
            expect(vehicle.speed).toBeLessThanOrEqual(
              limits.maxSpeed + EPSILON,
            );

            expect(Number.isFinite(vehicle.yaw)).toBe(true);
            expect(out.yaw).toBe(vehicle.yaw);
            expect(out.yaw).toBeGreaterThan(-180);
            expect(out.yaw).toBeLessThanOrEqual(180);
            for (const axis of [out.impulse.x, out.impulse.y, out.impulse.z])
              expect(Number.isFinite(axis)).toBe(true);

            if (ids.size === 0) expect(out.driverId).toBeUndefined();
            if (out.driverId !== undefined)
              expect(ids.has(out.driverId)).toBe(true);
            // Position-only riders keep the sticky driver (ADR 0025, 0128); riders with a slot follow seat 0 (ADR 0120, 0128).
            if (chosen)
              expect(out.driverId).toBe(
                ids.has(riderId(0)) ? riderId(0) : undefined,
              );
            else if (lastDriver !== undefined && ids.has(lastDriver))
              expect(out.driverId).toBe(lastDriver);

            // Only a departing rider vacates a seat (ADR 0128).
            if ([...lastRiders].every((id) => ids.has(id)))
              expect(out.finalCommands).toEqual([]);

            for (const command of [...out.stepCommands, ...out.finalCommands])
              expectDeclaredCommand(command, contract);

            expect(typeof out.riders.thirdPerson).toBe("boolean");
            expect(typeof out.riders.underwater).toBe("boolean");

            lastRiders = ids;
            lastDriver = out.driverId;
          });
        },
      ),
      { numRuns: 500 },
    );
  },
);
