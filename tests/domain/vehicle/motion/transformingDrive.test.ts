import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp } from "../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { SuvDrive } from "../../../../src/domain/vehicle/kinds/suv/drive";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/suv/spec";
import { bankSink } from "../../../../src/domain/vehicle/motion/bank";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import {
  climbInput,
  FORMS,
  type Form,
  verticalImpulse,
  verticalSpeed,
} from "../../../../src/domain/vehicle/motion/forms";
import {
  initialMotion,
  stepMotion,
} from "../../../../src/domain/vehicle/motion/motion";
import { TransformingDrive } from "../../../../src/domain/vehicle/motion/transformingDrive";
import {
  bankCommand,
  formCommands,
  gearCommand,
} from "../../../../src/domain/vehicle/motion/transformingEntity";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { type Body, engineStep } from "../../../support/engineModel";
import { waterSensors } from "../../../support/waterDepth";

const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const FORWARD: RawInput = { ...IDLE, moveY: 1 };

function context(depth = 0): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(depth),
    blockTypes: () => [],
    solidAt: (offset) => offset.y < 0,
  };
}

it("uses the supplied car height to decide whether the roof is submerged", () => {
  const tall = new TransformingDrive(
    0,
    {},
    { ...SUV_TRANSFORMING, carHeight: 4 },
    SUV_MOTION,
    SUV_TYRES,
  );
  const suv = new SuvDrive(0, {});
  tall.step(IDLE, context(2));
  suv.step(IDLE, context(2));
  expect(tall.form).toBe("car");
  expect(suv.form).toBe("submarine");
});

it("keeps car speed within the supplied limits throughout 300 forward ticks", () => {
  fc.assert(
    fc.property(fc.double({ min: 0.2, max: 1.5, noNaN: true }), (maxSpeed) => {
      const limits = { ...SUV_MOTION, maxSpeed };
      const drive = new TransformingDrive(
        0,
        {},
        SUV_TRANSFORMING,
        limits,
        SUV_TYRES,
      );
      let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
      for (let tick = 0; tick < 300; tick++) {
        const out = drive.step(FORWARD, {
          ...context(),
          tick,
          velocity: { ...body.vel, y: 0 },
        });
        expect(drive.form).toBe("car");
        expect(drive.speed).toBeLessThanOrEqual(limits.maxSpeed);
        body = engineStep(body, out.impulse, {
          mu: MOTION.defaultFriction,
        }).body;
      }
      expect(drive.speed).toBeCloseTo(limits.maxSpeed, 9);
    }),
  );
});

it("has no seat commands by default", () => {
  const drive = new TransformingDrive(
    0,
    {},
    SUV_TRANSFORMING,
    SUV_MOTION,
    SUV_TYRES,
  );
  expect(drive.onSeatVacated(0)).toStrictEqual([]);
});

it("keeps the SUV's door animation and sound when a seat is vacated", () => {
  expect(new SuvDrive(0, {}).onSeatVacated(0)).toStrictEqual([
    { type: "playAnimation", name: "door_fr" },
    { type: "playSound", name: "random.door_open" },
  ]);
});

// The mapping before ADR 0089, kept as an oracle.
interface LegacyDriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
  creep: boolean;
}
const LEGACY_NEUTRAL: LegacyDriveInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};
const LEGACY_SLOPE = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);
function legacyToDriveInput(raw: RawInput | undefined): LegacyDriveInput {
  if (
    raw === undefined ||
    !Number.isFinite(raw.moveX) ||
    !Number.isFinite(raw.moveY)
  ) {
    return LEGACY_NEUTRAL;
  }
  const steer = clamp(raw.moveX, -1, 1);
  const sideways = Math.abs(steer);
  // A phone stick pushed straight right reads about -0.2 forward/backward,
  // which would otherwise reverse the vehicle and flip the steering.
  if (
    sideways > SPEC.throttleDeadzone &&
    Math.abs(raw.moveY) <= sideways * LEGACY_SLOPE
  ) {
    return { throttle: 0, steer, handbrake: raw.jump, creep: true };
  }
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer, handbrake: raw.jump, creep: false };
}

function legacyDriveInputFor(
  raw: RawInput | undefined,
  form: Form,
): LegacyDriveInput {
  if (form === "takeoff") return LEGACY_NEUTRAL;
  const input = legacyToDriveInput(raw);
  if (form === "car") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
}

const anyYaw = fc.double({ min: -180, max: 180, noNaN: true });

const LEGACY_SUV = {
  maxSpeed: SUV_SPEC.maxSpeed,
  maxReverse: SUV_SPEC.maxReverse,
  accel: SUV_SPEC.accel,
  reverseAccel: SUV_SPEC.reverseAccel,
  brake: SUV_SPEC.brake,
  drag: SUV_SPEC.drag,
  turnRate: SUV_SPEC.turnRate,
  steerFullSpeed: SUV_SPEC.steerFullSpeed,
  grip: SUV_SPEC.grip,
  handbrakeGrip: SUV_SPEC.handbrakeGrip,
  creepSpeed: SUV_SPEC.creepSpeed,
};

it("an SUV in car form drives tick by tick as the old mapping did (ADR 0089)", () => {
  fc.assert(
    fc.property(
      anyYaw,
      fc.boolean(),
      fc.array(
        fc.record({
          moveX: fc.double({ min: -1, max: 1, noNaN: true }),
          moveY: fc.double({ min: -1, max: 1, noNaN: true }),
          velocity: fc.record({
            x: fc.double({ min: -2, max: 2, noNaN: true }),
            z: fc.double({ min: -2, max: 2, noNaN: true }),
          }),
        }),
        { minLength: 1, maxLength: 60 },
      ),
      (heading, jump, ticks) => {
        const drive = new SuvDrive(heading, {});
        let oracle = initialMotion(heading);
        ticks.forEach(({ moveX, moveY, velocity }, i) => {
          const raw = { moveX, moveY, jump };
          const ctx: TickContext = {
            ...context(),
            tick: i,
            velocity: { x: velocity.x, y: 0, z: velocity.z },
            onGround: true,
            // No obstacle, matching the oracle's step probe.
            solidAt: () => false,
          };
          const out = drive.step(raw, ctx);
          const o = stepMotion(
            oracle,
            legacyDriveInputFor(raw, "car"),
            { velocity, onGround: true },
            () => 0,
            LEGACY_SUV,
            LEGACY_SUV,
          );
          expect(drive.form).toBe("car");
          expect(drive.speed).toBe(o.state.speed);
          expect(drive.yaw).toBe(o.state.yaw);
          expect(out.impulse.x).toBe(o.impulse.x);
          expect(out.impulse.z).toBe(o.impulse.z);
          oracle = o.state;
        });
      },
    ),
    { numRuns: 100 },
  );
});

const resyncInput = fc.record({
  raw: fc.record({
    moveX: fc.integer({ min: -1, max: 1 }),
    moveY: fc.integer({ min: -1, max: 1 }),
    jump: fc.boolean(),
  }),
  onGround: fc.boolean(),
  depth: fc.constantFrom(0, 1, 3),
});

it("resync sends gravity and form first, then the current bank and gear", () => {
  fc.assert(
    fc.property(
      fc.array(resyncInput, { minLength: 1, maxLength: 80 }),
      fc.nat(),
      (inputs, index) => {
        const drive = new SuvDrive(0, {});
        const retry = index % inputs.length;
        inputs.forEach(({ raw, depth, onGround }, tick) => {
          if (tick === retry) drive.resync();
          const out = drive.step(raw, { ...context(depth), onGround, tick });
          if (tick === retry) {
            expect(out.commands).toEqual([
              ...formCommands(drive.form),
              bankCommand(drive.inspect().bank),
              gearCommand(drive.inspect().wheelsDown),
            ]);
          }
        });
      },
    ),
  );
});

it("without resync sends form commands exactly when form changes", () => {
  fc.assert(
    fc.property(
      fc.array(resyncInput, { minLength: 1, maxLength: 80 }),
      (inputs) => {
        const drive = new SuvDrive(0, {});
        inputs.forEach(({ raw, depth, onGround }, tick) => {
          const before = drive.form;
          const out = drive.step(raw, { ...context(depth), onGround, tick });
          const form = out.commands.filter(
            (c) => c.type === "triggerEvent" || c.name === "form",
          );
          expect(form).toEqual(
            before === drive.form ? [] : formCommands(drive.form),
          );
        });
      },
    ),
  );
});

it("keeps the restored form primed on its first unchanged tick", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FORMS), fc.boolean(), (form, jump) => {
      const drive = new SuvDrive(0, { form });
      const out = drive.step(
        { ...IDLE, jump },
        {
          ...context(form === "submarine" ? 3 : 0),
          onGround: form === "car",
        },
      );
      expect(drive.form).toBe(form);
      expect(
        out.commands.filter(
          (c) => c.type === "triggerEvent" || c.name === "form",
        ),
      ).toEqual([]);
    }),
  );
});

const tickSample = fc.record({
  raw: fc.record({
    moveX: fc.double({ min: -1, max: 1, noNaN: true }),
    moveY: fc.double({ min: -1, max: 1, noNaN: true }),
    jump: fc.boolean(),
  }),
  velocity: fc.record({
    x: fc.double({ min: -2, max: 2, noNaN: true }),
    y: fc.double({ min: -2, max: 2, noNaN: true }),
    z: fc.double({ min: -2, max: 2, noNaN: true }),
  }),
  onGround: fc.boolean(),
  depth: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 3, noNaN: true })),
});
const tickSequence = fc.array(tickSample, { minLength: 1, maxLength: 80 });

for (const [name, create] of [
  ["SUV", (form?: Form) => new SuvDrive(0, form ? { form } : {})],
  [
    "shared drive",
    (form?: Form) =>
      new TransformingDrive(
        0,
        form ? { form } : {},
        SUV_TRANSFORMING,
        SUV_MOTION,
        SUV_TYRES,
      ),
  ],
] as const) {
  it(`${name} has no vertical car impulse without a step ahead`, () => {
    fc.assert(
      fc.property(tickSequence, (ticks) => {
        const drive = create();
        ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
          const out = drive.step(raw, {
            ...context(depth),
            tick,
            velocity,
            onGround,
            solidAt: (offset) => offset.y <= -1,
          });
          if (drive.form === "car") expect(out.impulse.y).toBe(0);
        });
      }),
    );
  });

  it(`${name} uses the updated bank for every air impulse`, () => {
    fc.assert(
      fc.property(tickSequence, (ticks) => {
        for (const initial of [
          undefined,
          "takeoff",
          "hover",
          "landing",
        ] as const) {
          const drive = create(initial);
          ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
            const ctx = { ...context(depth), tick, velocity, onGround };
            const out = drive.step(raw, ctx);
            const form = drive.form;
            if (form === "car" || form === "submarine") return;
            const spec = SUV_TRANSFORMING;
            expect(out.impulse.y).toBe(
              verticalImpulse(
                clamp(
                  verticalSpeed(form, climbInput(raw), spec) -
                    bankSink(form, drive.inspect().bank, spec),
                  -spec.maxClimb,
                  spec.maxClimb,
                ),
                ctx.velocity.y,
                spec.flightVerticalDrag,
              ),
            );
          });
        }
      }),
    );
  });

  it(`${name} needs forward throttle to probe a submarine shore step`, () => {
    fc.assert(
      fc.property(tickSequence, (ticks) => {
        const floor = create("submarine");
        const wall = create("submarine");
        ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
          const input = { ...raw, moveY: -Math.abs(raw.moveY) };
          const ctx = {
            ...context(SUV_TRANSFORMING.carHeight + depth),
            tick,
            velocity,
            onGround,
          };
          let floorProbes = 0;
          let wallProbes = 0;
          const a = floor.step(input, {
            ...ctx,
            solidAt: (offset) => {
              floorProbes++;
              return offset.y < 0;
            },
          });
          const b = wall.step(input, {
            ...ctx,
            solidAt: (offset) => {
              wallProbes++;
              return (
                offset.y < 0 ||
                offset.y >= -SUV_TRANSFORMING.submarineStepProbeDrop
              );
            },
          });
          expect(floor.form).toBe("submarine");
          expect(wall.form).toBe("submarine");
          expect(a.impulse.y).toBe(b.impulse.y);
          expect(floorProbes).toBe(0);
          expect(wallProbes).toBe(0);
        });
      }),
    );
  });

  it(`${name} orders changed form commands before bank and gear`, () => {
    fc.assert(
      fc.property(tickSequence, (ticks) => {
        const drive = create();
        let sentBank: number | undefined;
        let sentGear: boolean | undefined;
        ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
          const previousForm = drive.form;
          const out = drive.step(raw, {
            ...context(depth),
            tick,
            velocity,
            onGround,
          });
          const { bank, wheelsDown } = drive.inspect();
          expect(out.commands).toEqual([
            ...(drive.form === previousForm ? [] : formCommands(drive.form)),
            ...(bank === sentBank ? [] : [bankCommand(bank)]),
            ...(wheelsDown === sentGear ? [] : [gearCommand(wheelsDown)]),
          ]);
          sentBank = bank;
          sentGear = wheelsDown;
        });
      }),
    );
  });

  it(`${name} sets rider flags from the resulting form on every tick`, () => {
    fc.assert(
      fc.property(tickSequence, (ticks) => {
        const drive = create();
        ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
          const out = drive.step(raw, {
            ...context(depth),
            tick,
            velocity,
            onGround,
          });
          expect(out.riders).toEqual({
            thirdPerson: drive.form !== "car",
            underwater: drive.form === "submarine",
          });
        });
      }),
    );
  });
}
