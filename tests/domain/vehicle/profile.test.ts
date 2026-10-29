import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EMPTY_COUNTER } from "../../../src/domain/shared/hitCounter";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import { NEUTRAL_CONTROL } from "../../../src/domain/vehicle/driveInput";
import { isVehicleKind, VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  CAMPER_MOTION,
  CAMPER_PROFILE,
  CAMPER_TYRES,
} from "../../../src/domain/vehicle/kinds/camper/profile";
import {
  CAMPER_AIR,
  CAMPER_SPEC,
  CAMPER_TRANSFORMING,
  CAMPER_WATER,
} from "../../../src/domain/vehicle/kinds/camper/spec";
import {
  createVehicle,
  KINDS,
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import {
  SPORTSBOAT_MOTION,
  SPORTSBOAT_PROFILE,
} from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  SUV_MOTION,
  SUV_PROFILE,
  SUV_TYRES,
} from "../../../src/domain/vehicle/kinds/suv/profile";
import {
  AIR,
  SUV_SPEC,
  SUV_TRANSFORMING,
  WATER,
} from "../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../src/domain/vehicle/motion/constants";
import {
  type GroundInput,
  initialMotion,
  stepMediumMotion,
  stepMotion,
  updateSpeed,
} from "../../../src/domain/vehicle/motion/motion";
import { STEP_LANES } from "../../../src/domain/vehicle/motion/stepUp";
import { SPEC } from "../../../src/domain/vehicle/spec";

const NEUTRAL_GROUND: GroundInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = fc.integer({ min: -18000, max: 18000 }).map((n) => n / 100);
const limits = fc.record({
  maxSpeed: number(0.2, 4),
  maxReverse: number(0.01, 0.2),
  accel: number(0.001, 0.1),
  reverseAccel: number(0.001, 0.1),
  brake: number(0.001, 0.1),
  drag: number(0.001, 0.1),
  turnRate: number(1, 12),
  steerFullSpeed: number(0.01, 0.2),
  grip: number(0, 1),
  handbrakeGrip: number(0, 1),
  creepSpeed: number(0.01, 0.2),
});
const throttle = number(-1, 1);
const input = fc.record({
  throttle,
  steer: throttle,
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const velocity = fc.record({ x: number(-5, 5), z: number(-5, 5) });

describe("vehicle profiles (ADR 0050)", () => {
  it.each([
    {
      kind: "suv",
      body: { front: 2.41, halfWidth: 1.47, height: 2.08 },
      clearance: { halfX: 1, halfZ: 1, height: 3 },
    },
    {
      kind: "camper",
      body: { front: 3.7, halfWidth: 1.5, height: 4.0 },
      clearance: { halfX: 1, halfZ: 1, height: 4 },
    },
    {
      kind: "sportsboat",
      body: { front: 3.0, halfWidth: 1.06, height: 1.2 },
      clearance: { halfX: 1, halfZ: 1, height: 2 },
    },
  ] as const)(
    "preserves $kind body dimensions and placement clearance",
    ({ kind, body, clearance }) => {
      expect(profileOf(kind).body).toEqual(body);
      expect(profileOf(kind).placement.clearance).toEqual(clearance);
    },
  );

  it("builds the SUV profile from the existing tuning and seat data", () => {
    expect(SUV_MOTION).toEqual({
      maxSpeed: SUV_SPEC.maxSpeed,
      maxReverse: SUV_SPEC.maxReverse,
      accel: SUV_SPEC.accel,
      reverseAccel: SUV_SPEC.reverseAccel,
      brake: SUV_SPEC.brake,
      drag: SUV_SPEC.drag,
      turnRate: SUV_SPEC.turnRate,
      steerFullSpeed: SUV_SPEC.steerFullSpeed,
      grip: SUV_SPEC.grip,
    });
    expect(SUV_TYRES).toEqual({
      handbrakeGrip: SUV_SPEC.handbrakeGrip,
      creepSpeed: SUV_SPEC.creepSpeed,
    });
    expect(SUV_PROFILE).toEqual({
      kind: "suv",
      fleetLimit: 10,
      body: {
        front: SUV_SPEC.bodyFront,
        halfWidth: SUV_SPEC.bodyHalfWidth,
        height: SUV_SPEC.carHeight,
      },
      footprint: 3.05,
      seats: {
        positions: [
          { x: -0.494, z: -0.0446875 },
          { x: 0.494, z: -0.0446875 },
          { x: -0.494, z: -1.04 },
          { x: 0.494, z: -1.04 },
        ],
      },
      boarding: { order: "engine" },
      beams: { reach: SUV_SPEC.headlightReach, lanes: [0] },
      placement: {
        surfaces: ["top"],
        clearance: { halfX: 1, halfZ: 1, height: 3 },
      },
      chaseCamera: "mid",
      defaultPaint: "khaki",
    });
  });

  it("reads the camper's tyre values from its spec (ADR 0089)", () => {
    expect(CAMPER_TYRES).toEqual({
      handbrakeGrip: CAMPER_SPEC.handbrakeGrip,
      creepSpeed: CAMPER_SPEC.creepSpeed,
    });
  });

  it("gives the sports boat its own values from ADR 0051", () => {
    expect(SPORTSBOAT_MOTION).toStrictEqual({
      maxSpeed: 1.12,
      maxReverse: 0.2,
      accel: 0.0225,
      reverseAccel: 0.01125,
      brake: 0.04,
      drag: 0.02,
      turnRate: 6,
      steerFullSpeed: 0.08,
      grip: 0.6,
    });
    expect(SPORTSBOAT_SPEC.creepSpeed).toBe(0.12);
    expect("handbrakeGrip" in SPORTSBOAT_SPEC).toBe(false);
    expect(SPORTSBOAT_PROFILE).toStrictEqual({
      kind: "sportsboat",
      fleetLimit: 1,
      body: { front: 3.0, halfWidth: 1.06, height: 1.2 },
      footprint: 3.5,
      seats: {
        positions: [
          { x: -0.38, z: 0.1625 },
          { x: 0.38, z: 0.1625 },
          { x: -0.38, z: -0.8 },
          { x: 0.38, z: -0.8 },
        ],
      },
      boarding: { order: "chosen", aimHeight: 0.52, aimRadius: 0.38 },
      beams: {
        reach: Array.from({ length: 15 }, (_, i) => 4 * (i + 1)),
        lanes: [-3, 3],
      },
      placement: {
        surfaces: ["water", "lava", "top"],
        clearance: { halfX: 1, halfZ: 1, height: 2 },
      },
      monitor: {
        group: "sportsboat_equipment",
        tools: [{ item: "icebreaker_switch", states: ["off", "on"] }],
      },
      placementGift: "sportsboat_equipment_box",
      chaseCamera: "near",
      defaultPaint: "black",
    });
    expect(profileOf("sportsboat")).toBe(SPORTSBOAT_PROFILE);
  });

  it("gives a kind's beam levels one integer light level from 0 to 15 per reach", () => {
    for (const kind of VEHICLE_KINDS) {
      const { reach, levels } = profileOf(kind).beams;
      if (levels === undefined) continue;
      expect(levels).toHaveLength(reach.length);
      for (const level of levels) {
        expect(Number.isInteger(level)).toBe(true);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(15);
      }
    }
  });

  it("freezes every profile and motion limit so a write cannot change all vehicles of a kind", () => {
    expect(Object.isFrozen(KINDS)).toBe(true);
    expect(Object.isFrozen(SUV_TYRES)).toBe(true);
    expect(Object.isFrozen(CAMPER_TYRES)).toBe(true);
    expect(Object.isFrozen(SUV_MOTION)).toBe(true);
    expect(Object.isFrozen(CAMPER_MOTION)).toBe(true);
    expect(Object.isFrozen(SPORTSBOAT_MOTION)).toBe(true);
    for (const kind of VEHICLE_KINDS) {
      expect(Object.isFrozen(KINDS[kind])).toBe(true);
      const profile = profileOf(kind);
      for (const part of [
        profile,
        profile.body,
        profile.seats,
        profile.boarding,
        profile.beams,
        profile.beams.reach,
        profile.beams.lanes,
        ...(profile.beams.levels ? [profile.beams.levels] : []),
        profile.placement,
      ]) {
        expect(Object.isFrozen(part)).toBe(true);
      }
    }
  });

  it("freezes the tuning tables, media and shared value objects so a write cannot change every vehicle", () => {
    for (const table of [
      SPEC,
      MOTION,
      STEP_LANES,
      SUV_SPEC,
      SUV_SPEC.headlightReach,
      AIR,
      WATER,
      SUV_TRANSFORMING,
      SUV_TRANSFORMING.air,
      SUV_TRANSFORMING.water,
      CAMPER_SPEC,
      CAMPER_SPEC.headlightReach,
      CAMPER_AIR,
      CAMPER_WATER,
      CAMPER_TRANSFORMING,
      CAMPER_TRANSFORMING.air,
      CAMPER_TRANSFORMING.water,
      NEUTRAL_CONTROL,
      EMPTY_COUNTER,
    ]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });

  it("recognizes exactly the registered kinds and preserves kind when creating or rebuilding", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(isVehicleKind(value)).toBe(
          VEHICLE_KINDS.some((kind) => kind === value),
        );
      }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), yaw, (kind, heading) => {
        expect(isVehicleKind(kind)).toBe(true);
        expect(profileOf(kind)).toBe(
          {
            suv: SUV_PROFILE,
            sportsboat: SPORTSBOAT_PROFILE,
            camper: CAMPER_PROFILE,
            bulldozer: BULLDOZER_PROFILE,
          }[kind],
        );
        expect(createVehicle(kind, asVehicleId("v"), heading).kind).toBe(kind);
        expect(
          rebuildVehicle(kind, asVehicleId("v"), heading, [], { form: "car" })
            .kind,
        ).toBe(kind);
      }),
    );
  });

  it("keeps speed inside the profile limits across arbitrary control sequences", () => {
    fc.assert(
      fc.property(
        limits,
        fc.array(input, { minLength: 1, maxLength: 200 }),
        (motion, inputs) => {
          let speed = 0;
          for (const control of inputs) {
            speed = updateSpeed(
              speed,
              control.throttle,
              control.creep,
              motion,
              motion.creepSpeed,
            );
            expect(speed).toBeLessThanOrEqual(motion.maxSpeed);
            expect(speed).toBeGreaterThanOrEqual(-motion.maxReverse);
          }
        },
      ),
    );
  });

  it("accelerates above the SUV maximum when the profile allows it", () => {
    fc.assert(
      fc.property(number(1, 4), number(0.001, 0.1), (maxSpeed, accel) => {
        const motion = { ...SUV_MOTION, maxSpeed, accel };
        expect(
          updateSpeed(
            SUV_SPEC.maxSpeed,
            1,
            false,
            motion,
            SUV_TYRES.creepSpeed,
          ),
        ).toBeGreaterThan(SUV_SPEC.maxSpeed);
        expect(
          updateSpeed(maxSpeed, 1, false, motion, SUV_TYRES.creepSpeed),
        ).toBe(maxSpeed);
      }),
    );
  });

  it("caps flight speed and velocity at the smaller profile or medium maximum", () => {
    fc.assert(
      fc.property(
        limits,
        number(0.2, 5),
        number(0.5, 1),
        yaw,
        input,
        velocity,
        (motion, mediumMax, drag, heading, control, v) => {
          const maximum = Math.min(motion.maxSpeed, mediumMax);
          const out = stepMediumMotion(
            { ...initialMotion(heading), speed: motion.maxSpeed },
            control,
            v,
            { drag, maxSpeed: mediumMax },
            motion,
            motion.creepSpeed,
          );
          expect(out.state.speed).toBeLessThanOrEqual(maximum);
          expect(
            Math.hypot(
              (v.x + out.impulse.x) * drag,
              (v.z + out.impulse.z) * drag,
            ),
          ).toBeLessThanOrEqual(maximum + 1e-9);
          const full = stepMediumMotion(
            { ...initialMotion(heading), speed: motion.maxSpeed },
            { ...NEUTRAL_GROUND, throttle: 1 },
            { x: 0, z: 0 },
            { drag, maxSpeed: mediumMax },
            motion,
            motion.creepSpeed,
          );
          expect(full.state.speed).toBe(maximum);
          expect(
            Math.hypot(full.impulse.x * drag, full.impulse.z * drag),
          ).toBeCloseTo(maximum, 10);
        },
      ),
    );
  });

  it("uses profile steering and grip on the ground", () => {
    fc.assert(
      fc.property(
        limits,
        yaw,
        throttle,
        fc.boolean(),
        (motion, heading, steer, handbrake) => {
          const speed = motion.maxSpeed / 2;
          const f = forward(heading);
          const right = rightOf(f);
          const v = { x: right.x * 0.1, z: right.z * 0.1 };
          const out = stepMotion(
            { ...initialMotion(heading), speed },
            { ...NEUTRAL_GROUND, steer, handbrake },
            { velocity: v, onGround: true },
            () => 0,
            motion,
            motion,
          );
          const nextSpeed = Math.max(0, speed - motion.drag);
          const turn =
            steer *
            motion.turnRate *
            Math.min(1, nextSpeed / motion.steerFullSpeed);
          expect(out.forward.x).toBeCloseTo(forward(heading - turn).x, 10);
          expect(out.forward.z).toBeCloseTo(forward(heading - turn).z, 10);
          const sideways = dot(v, rightOf(out.forward));
          const given = {
            x: (v.x + out.impulse.x) * MOTION.defaultFriction,
            z: (v.z + out.impulse.z) * MOTION.defaultFriction,
          };
          expect(dot(given, rightOf(out.forward))).toBeCloseTo(
            sideways * (1 - (handbrake ? motion.handbrakeGrip : motion.grip)),
            10,
          );
        },
      ),
    );
  });

  it("a wall hit never turns any profile's forward speed into reverse (ADR 0077)", () => {
    // Pushed backward by the wall harder than the profile may reverse: before
    // ADR 0077 the speed ended at the reverse limit, now it stops at 0.
    const wallCase = fc
      .tuple(limits, number(0, 1), number(0.01, 0.99))
      .map(([motion, reverse, ratio]) => {
        const maxSpeed = Math.max(motion.maxSpeed, motion.maxReverse + 0.1);
        const maxReverse = motion.maxReverse * (0.1 + 0.9 * reverse);
        const vLong = -(maxReverse + (maxSpeed - maxReverse) * ratio);
        return { motion: { ...motion, maxSpeed, maxReverse }, vLong };
      });
    const pushed = { ...NEUTRAL_GROUND, throttle: 1 };
    fc.assert(
      fc.property(wallCase, yaw, ({ motion, vLong }, heading) => {
        const f = forward(heading);
        const aimed = {
          x: f.x * motion.maxSpeed * 4,
          z: f.z * motion.maxSpeed * 4,
        };
        const v = { x: f.x * vLong, z: f.z * vLong };
        const start = { ...initialMotion(heading), speed: motion.maxSpeed };
        const ground = stepMotion(
          { ...start, expected: aimed },
          pushed,
          { velocity: v, onGround: true },
          () => 0,
          motion,
          motion,
        );
        const flight = stepMediumMotion(
          { ...start, mediumExpected: aimed },
          pushed,
          v,
          { drag: 1, maxSpeed: 5 },
          motion,
          motion.creepSpeed,
        );
        for (const out of [ground, flight]) {
          expect(out.blocked).toBe(true);
          expect(out.state.speed).toBe(0);
        }
      }),
    );
  });

  it("lets sports boat and camper players choose seats while SUV and bulldozer keep engine order (ADR 0050, 0120, 0154)", () => {
    for (const kind of VEHICLE_KINDS)
      expect(profileOf(kind).boarding.order).toBe(
        kind === "sportsboat" || kind === "camper" ? "chosen" : "engine",
      );
  });

  it("limits each player to one camper", () => {
    expect(CAMPER_PROFILE.fleetLimit).toBe(1);
  });

  it("gives the camper a khaki default paint (ADR 0067, 0076)", () => {
    expect(CAMPER_PROFILE.defaultPaint).toBe("khaki");
  });
});

describe("vehicle hints (ADR 0086)", () => {
  it("puts the camper's bumper hint on its hitboxes and its seat hint in the parked room", () => {
    expect(CAMPER_PROFILE.hints).toEqual({
      bumper: {
        boxXs: CAMPER_SPEC.bumperBoxXs,
        boxZ: CAMPER_SPEC.bodyFront,
        boxHalf: CAMPER_SPEC.bumperBoxSize / 2,
        bodyHalfWidth: CAMPER_SPEC.bodyHalfWidth,
        reach: CAMPER_SPEC.bumperHintReach,
        feet: CAMPER_SPEC.bumperHintFeet,
      },
      driverSeat: {
        reach: CAMPER_SPEC.seatHintReach,
        feet: CAMPER_SPEC.seatHintFeet,
      },
    });
    expect(Object.isFrozen(CAMPER_PROFILE.hints)).toBe(true);
  });

  it("gives no hints to the kinds that take hits on their whole body", () => {
    expect(SUV_PROFILE.hints).toBeUndefined();
    expect(SPORTSBOAT_PROFILE.hints).toBeUndefined();
    expect(createVehicle("suv", asVehicleId("v"), 0).showsHints).toBe(false);
    expect(createVehicle("sportsboat", asVehicleId("v"), 0).showsHints).toBe(
      false,
    );
    expect(createVehicle("camper", asVehicleId("v"), 0).showsHints).toBe(true);
  });
});
