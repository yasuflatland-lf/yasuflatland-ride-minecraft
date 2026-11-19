import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { forward } from "../../../src/domain/shared/vec";
import {
  VEHICLE_KINDS,
  type VehicleKind,
} from "../../../src/domain/vehicle/kind";
import { BULLDOZER_MOTION } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import { CAMPER_MOTION } from "../../../src/domain/vehicle/kinds/camper/profile";
import {
  createVehicle,
  profileOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SCOOTER_MOTION } from "../../../src/domain/vehicle/kinds/scooter/profile";
import { SPORTSBOAT_MOTION } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SUV_MOTION } from "../../../src/domain/vehicle/kinds/suv/profile";
import { MOTION } from "../../../src/domain/vehicle/motion/constants";
import { selectHits } from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { engineStep } from "../../support/engineModel";
import { waterSensors } from "../../support/waterDepth";

// Typed by VehicleKind, so adding a kind fails the build until its row is added here.
const MAX_REVERSE: Record<VehicleKind, number> = {
  scooter: SCOOTER_MOTION.maxReverse,
  suv: SUV_MOTION.maxReverse,
  camper: CAMPER_MOTION.maxReverse,
  sportsboat: SPORTSBOAT_MOTION.maxReverse,
  bulldozer: BULLDOZER_MOTION.maxReverse,
};
const GROUND_FRICTION = 0.688;
const kind = fc.constantFrom(...VEHICLE_KINDS);
const yaw = fc.integer({ min: -18_000, max: 18_000 }).map((c) => c / 100);
const midHeight = (SPEC.ramMinDy + SPEC.ramMaxDy) / 2;

describe("reverse ram threshold per kind (ADR 0006, 0050)", () => {
  it.each(VEHICLE_KINDS)("%s rams below its full reverse speed", (k) => {
    const min = profileOf(k).ramMinReverseSpeed;
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(MAX_REVERSE[k]);
  });

  it("hits a target behind at any reverse speed above the kind's threshold", () => {
    fc.assert(
      fc.property(
        kind.chain((k) =>
          fc.record({
            k: fc.constant(k),
            speed: fc.double({
              min: -MAX_REVERSE[k],
              max: -profileOf(k).ramMinReverseSpeed,
              maxExcluded: true,
              noNaN: true,
            }),
          }),
        ),
        yaw,
        ({ k, speed }, y) => {
          const f = forward(y);
          const { body, ramMinReverseSpeed } = profileOf(k);
          const behind = -body.front / 2;
          const hits = selectHits(
            f,
            speed,
            [
              {
                id: "t",
                offset: { x: f.x * behind, y: midHeight, z: f.z * behind },
              },
            ],
            new Map(),
            0,
            body,
            ramMinReverseSpeed,
          );
          expect(hits).toHaveLength(1);
        },
      ),
    );
  });

  it("never hits anything moving forward at or below ramMinSpeed, as when creeping or climbing a step", () => {
    // Creep speeds and the step bump are forward speeds at or below
    // SPEC.ramMinSpeed (MOTION.stepMinSpeed equals it), so no kind's reverse
    // threshold may make them ram.
    expect(MOTION.stepMinSpeed).toBeLessThanOrEqual(SPEC.ramMinSpeed);
    fc.assert(
      fc.property(
        kind,
        fc.oneof(
          fc.constantFrom(0, SPEC.ramMinSpeed, MOTION.stepMinSpeed),
          fc.double({ min: 0, max: SPEC.ramMinSpeed, noNaN: true }),
        ),
        yaw,
        fc.double({ min: -1, max: 1, noNaN: true }),
        (k, speed, y, along) => {
          const f = forward(y);
          const { body, ramMinReverseSpeed } = profileOf(k);
          const d = along * body.front;
          expect(
            selectHits(
              f,
              speed,
              [{ id: "t", offset: { x: f.x * d, y: midHeight, z: f.z * d } }],
              new Map(),
              0,
              body,
              ramMinReverseSpeed,
            ),
          ).toEqual([]);
        },
      ),
    );
  });

  it.each(VEHICLE_KINDS)(
    "%s held in full reverse rams a target behind it",
    (k) => {
      const v = createVehicle(k, asVehicleId("v"), 0);
      const behind = -profileOf(k).body.front / 2;
      let vel = { x: 0, z: 0 };
      let pos = { x: 0, z: 0 };
      let hits = 0;
      for (let tick = 0; tick < 100 && hits === 0; tick++) {
        const out = v.tick({
          tick,
          riders: [],
          deckSeatInputs: [],
          testInput: { moveX: 0, moveY: -1, jump: false },
          velocity: { ...vel, y: 0 },
          onGround: true,
          ...waterSensors(),
          blockTypes: () => [],
          solidAt: () => false,
          targets: () => {
            const f = forward(v.yaw);
            return [
              {
                id: "t",
                offset: { x: f.x * behind, y: midHeight, z: f.z * behind },
              },
            ];
          },
        });
        hits += out.hits.length;
        const r = engineStep(
          { pos, vel },
          { x: out.impulse.x, z: out.impulse.z },
          { mu: GROUND_FRICTION },
        );
        pos = r.body.pos;
        vel = r.body.vel;
      }
      expect(v.speed).toBeLessThan(0);
      expect(hits).toBe(1);
    },
  );
});
