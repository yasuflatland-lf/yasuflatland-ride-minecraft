import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EMPTY_COUNTER } from "../../../src/domain/shared/hitCounter";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import { NEUTRAL_CONTROL } from "../../../src/domain/vehicle/driveInput";
import { isVehicleKind, VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  BULLDOZER_AIR,
  BULLDOZER_SPEC,
  BULLDOZER_WATER,
  BULLDOZER_WIDE_BLADE,
} from "../../../src/domain/vehicle/kinds/bulldozer/spec";
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
import * as kinds from "../../../src/domain/vehicle/kinds/index";
import {
  createVehicle,
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SCOOTER_PROFILE } from "../../../src/domain/vehicle/kinds/scooter/profile";
import { SCOOTER_SPEC } from "../../../src/domain/vehicle/kinds/scooter/spec";
import { SPORTSBOAT_ATTITUDE } from "../../../src/domain/vehicle/kinds/sportsboat/attitude";
import {
  SPORTSBOAT_DRAG,
  SPORTSBOAT_WATER,
} from "../../../src/domain/vehicle/kinds/sportsboat/drive";
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
import * as motionConstants from "../../../src/domain/vehicle/motion/constants";
import { MOTION } from "../../../src/domain/vehicle/motion/constants";
import {
  type GroundInput,
  initialMotion,
  stepMediumMotion,
  stepMotion,
  updateSpeed,
} from "../../../src/domain/vehicle/motion/motion";
import { stepLanes } from "../../../src/domain/vehicle/motion/stepUp";
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
  it("protects riders from fire only for the sports boat", () => {
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), (kind) => {
        expect(profileOf(kind).ridersFireProof).toBe(kind === "sportsboat");
      }),
    );
  });

  it("declares exactly the liquid surfaces as view-ray placement liquids", () => {
    fc.assert(
      fc.property(fc.constantFrom(...VEHICLE_KINDS), (kind) => {
        const { surfaces, liquids } = profileOf(kind).placement;
        expect(liquids).toEqual(
          new Set(surfaces.filter((surface) => surface !== "top")),
        );
      }),
    );
  });

  it.each([
    {
      kind: "suv",
      body: { front: 2.68, halfWidth: 1.43, height: 2.36 },
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

  it("preserves the SUV footprint and seat positions", () => {
    expect(SUV_PROFILE.footprint).toBe(3.18);
    expect(SUV_PROFILE.seats.positions).toEqual([
      { x: -0.463, z: -0.089 },
      { x: 0.463, z: -0.089 },
      { x: -0.463, z: -0.974 },
      { x: 0.463, z: -0.974 },
    ]);
  });

  it("keeps the SUV ladder foot at least 0.9 block outside its body and the anchor inside", () => {
    expect(SUV_SPEC.roofTentEntranceX).toBeGreaterThanOrEqual(
      SUV_SPEC.bodyHalfWidth + 0.9,
    );
    expect(SUV_SPEC.roofTentAnchorX).toBeLessThan(SUV_SPEC.bodyHalfWidth);
    const shellHalfWidth = SUV_SPEC.roofTentShellHalfWidth;
    expect(SUV_SPEC.roofTentAnchorX).toBeCloseTo(
      shellHalfWidth - SUV_SPEC.roofTentHardtopHalfWidth,
    );
    expect(SUV_SPEC.roofTentAnchorX - shellHalfWidth).toBeCloseTo(
      -SUV_SPEC.roofTentHardtopHalfWidth,
    );
    expect(
      SUV_SPEC.roofTentAnchorX + shellHalfWidth - SUV_SPEC.bodyHalfWidth,
    ).toBeGreaterThan(0);
    expect(SUV_SPEC.roofTentEntranceX).toBeCloseTo(
      SUV_SPEC.roofTentAnchorX + shellHalfWidth + (0.5 + 7.3) / 16,
    );
    expect(SUV_SPEC.roofTentEntranceZ).toBeCloseTo(
      SUV_SPEC.roofTentAnchorZ - 6 / 16,
    );
  });

  it("reads the camper's tyre values from its spec (ADR 0089)", () => {
    expect(CAMPER_TYRES).toEqual({
      handbrakeGrip: CAMPER_SPEC.handbrakeGrip,
      creepSpeed: CAMPER_SPEC.creepSpeed,
    });
  });

  it("preserves the sports boat footprint, seats, beams and placement", () => {
    expect(SPORTSBOAT_PROFILE).toMatchObject({
      footprint: 3.5,
      seats: {
        positions: [
          { x: -0.38, z: 0.1625 },
          { x: 0.38, z: 0.1625 },
          { x: -0.38, z: -0.8 },
          { x: 0.38, z: -0.8 },
        ],
      },
      boarding: { aimHeight: 0.52, aimRadius: 0.38 },
      beams: {
        reach: Array.from({ length: 15 }, (_, i) => 4 * (i + 1)),
        lanes: [-3, 3],
      },
      placement: { surfaces: ["water", "lava", "top"] },
    });
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

  it("keeps the frozen vehicle tables and their frozen descendants", () => {
    // These contracts are typed as readonly but contain unfrozen objects.
    const readonlyPaths = [
      /^CAMPER_SPEC\.(bumperBoxXs|bumperHintFeet|seatHintFeet)$/,
      /^DRAWER_GEAR_IDS$/,
      /^SPORTSBOAT_SPEC\.icebreaker\.probeHeights$/,
      /^KINDS\.\w+\.entity$/,
      /\.positions\.\d+$/,
      /\.paintPolicy$/,
      /\.hints\.(bumper\.(boxXs|feet)|driverSeat\.feet)$/,
    ];
    const visit = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object") return;
      if (readonlyPaths.some((pattern) => pattern.test(path))) return;
      expect(Object.isFrozen(value), path).toBe(true);
      for (const [key, child] of Object.entries(value))
        visit(child, `${path}.${key}`);
    };
    for (const [name, table] of Object.entries({
      ...kinds,
      ...motionConstants,
      SPEC,
      NEUTRAL_CONTROL,
      EMPTY_COUNTER,
      SUV_SPEC,
      SUV_MOTION,
      SUV_TYRES,
      AIR,
      WATER,
      SUV_TRANSFORMING,
      CAMPER_SPEC,
      CAMPER_MOTION,
      CAMPER_TYRES,
      CAMPER_AIR,
      CAMPER_WATER,
      CAMPER_TRANSFORMING,
      SPORTSBOAT_SPEC,
      SPORTSBOAT_MOTION,
      SPORTSBOAT_ATTITUDE,
      SPORTSBOAT_DRAG,
      SPORTSBOAT_WATER,
      BULLDOZER_SPEC,
      BULLDOZER_AIR,
      BULLDOZER_WATER,
      BULLDOZER_WIDE_BLADE,
      SCOOTER_SPEC,
      suvStepLanes: stepLanes(SUV_TRANSFORMING.stepLaneOffset),
    })) {
      visit(table, name);
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
            scooter: SCOOTER_PROFILE,
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

  it.each([
    ["suv", 10, "mid"],
    ["camper", 1, "far"],
    ["sportsboat", 1, "near"],
    ["bulldozer", 1, "mid"],
    ["scooter", 10, "near"],
  ] as const)(
    "sets the %s fleet limit and chase camera",
    (kind, limit, camera) => {
      expect(profileOf(kind).fleetLimit).toBe(limit);
      expect(profileOf(kind).chaseCamera).toBe(camera);
    },
  );

  it("gives the camper a khaki default paint (ADR 0067, 0076)", () => {
    expect(CAMPER_PROFILE.paintPolicy).toEqual({
      kind: "fixed",
      paint: "khaki",
    });
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

describe("roof tent mounts", () => {
  it("keeps finite, frozen mount points with anchors inside and the SUV entrance outside the body", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        fc.constantFrom("anchor" as const, "entrance" as const),
        (kind, pointName) => {
          const profile = profileOf(kind);
          const mount = profile.roofTent;
          if (kind !== "suv" && kind !== "camper") {
            expect(mount).toBeUndefined();
            return;
          }
          const rear = kind === "suv" ? (31 * 1.45) / 16 : CAMPER_SPEC.bodyRear;
          expect(mount).toBeDefined();
          if (!mount) throw new Error("Missing roof tent mount");
          const point = mount[pointName];
          for (const value of [mount.roofHeight, point.x, point.z])
            expect(Number.isFinite(value)).toBe(true);
          if (profile.kind === "suv" && pointName === "entrance") {
            expect(point.x).toBeGreaterThan(profile.body.halfWidth);
          } else {
            expect(Math.abs(point.x)).toBeLessThanOrEqual(
              profile.body.halfWidth,
            );
          }
          expect(point.z).toBeGreaterThanOrEqual(-rear);
          expect(point.z).toBeLessThanOrEqual(profile.body.front);
          if (kind === "camper" && pointName === "entrance")
            expect(point.x).toBeLessThan(0);
          expect(mount.ladder).toBe(kind === "suv");
          expect(Object.isFrozen(mount)).toBe(true);
          expect(Object.isFrozen(point)).toBe(true);
        },
      ),
    );
  });

  it("matches the model roofs and keeps the camper anchor between its roof fixtures", () => {
    expect(SUV_PROFILE.roofTent?.roofHeight).toBeCloseTo(
      (26.1 * 1.45) / 16,
      10,
    );
    expect(
      Math.abs(
        (SUV_PROFILE.roofTent?.roofHeight ?? NaN) - SUV_PROFILE.body.height,
      ),
    ).toBeLessThanOrEqual(0.3);
    expect(CAMPER_PROFILE.roofTent).toEqual({
      roofHeight: CAMPER_SPEC.carHeight,
      anchor: { x: 0, z: -0.875 },
      ladder: false,
      entrance: { x: -1.0625, z: -3.7 },
    });
    expect(CAMPER_PROFILE.roofTent?.roofHeight).toBe(4.0);

    // Mirror tools/gen_camper.py's RACK and small vent box; model z points backward.
    const rackPx = { halfWidth: 20, front: 22, rear: 55 };
    const ventPx = { halfWidth: 4, front: -2, rear: 6 };
    const anchor = CAMPER_PROFILE.roofTent?.anchor;
    expect(anchor).toBeDefined();
    if (!anchor) throw new Error("Missing camper roof tent anchor");
    for (const fixture of [rackPx, ventPx]) {
      const inside =
        Math.abs(anchor.x) <= fixture.halfWidth / 16 &&
        anchor.z >= -fixture.rear / 16 &&
        anchor.z <= -fixture.front / 16;
      expect(inside).toBe(false);
    }
    expect(anchor.z).toBeGreaterThan(-rackPx.front / 16);
    expect(anchor.z).toBeLessThan(-ventPx.rear / 16);
  });
});
