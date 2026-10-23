import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp } from "../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/camper/spec";
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
  type MotionResult,
  stepMotion,
} from "../../../../src/domain/vehicle/motion/motion";
import { submarineVerticalSpeed } from "../../../../src/domain/vehicle/motion/submarine";
import type { TransformingSpec } from "../../../../src/domain/vehicle/motion/transforming";
import {
  groundInputFor,
  type HorizontalStep,
  type HorizontalStepInput,
  type InputMapping,
  TransformingDrive,
  type TransformingOptions,
  transformingHorizontalStep,
} from "../../../../src/domain/vehicle/motion/transformingDrive";
import {
  bankCommand,
  formCommands,
  gearCommand,
} from "../../../../src/domain/vehicle/motion/transformingEntity";
import { waterDepthAt } from "../../../../src/domain/vehicle/motion/water";
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

it("flies with a finite climb and a level bank when the kind has no bank", () => {
  const spec = { ...SUV_TRANSFORMING, maxBank: 0 };
  fc.assert(
    fc.property(
      fc.constantFrom<Form>("takeoff", "hover", "landing", "submarine"),
      tickSequence,
      (initial, ticks) => {
        const drive = new TransformingDrive(
          0,
          { form: initial },
          spec,
          SUV_MOTION,
          SUV_TYRES,
        );
        ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
          const out = drive.step(raw, {
            ...context(depth),
            tick,
            velocity,
            onGround,
          });
          expect(Number.isFinite(out.impulse.y)).toBe(true);
          expect(drive.inspect().bank).toBe(0);
          for (const c of out.commands) {
            if (c.type === "setProperty" && c.name === "bank") {
              expect(c.value).toBe(0);
            }
          }
        });
      },
    ),
  );
});

const stepTerrain = fc.record({
  stepAt: fc.double({ min: 0.5, max: 4, noNaN: true }),
  stepRise: fc.integer({ min: 0, max: 3 }),
});

function terrainContext(
  { stepAt, stepRise }: { stepAt: number; stepRise: number },
  {
    depth,
    velocity,
    onGround,
  }: typeof tickSample extends fc.Arbitrary<infer T> ? T : never,
  tick: number,
): TickContext {
  return {
    ...context(depth),
    tick,
    velocity,
    onGround,
    solidAt: (o) => o.y < 0 || (o.x >= stepAt && o.y < stepRise),
  };
}

it("a drive given transformingHorizontalStep explicitly steps like one given no options", () => {
  const options: TransformingOptions = {
    inputFor: groundInputFor,
    horizontal: transformingHorizontalStep,
  };
  fc.assert(
    fc.property(stepTerrain, tickSequence, (ground, ticks) => {
      const a = new TransformingDrive(
        0,
        {},
        SUV_TRANSFORMING,
        SUV_MOTION,
        SUV_TYRES,
      );
      const b = new TransformingDrive(
        0,
        {},
        SUV_TRANSFORMING,
        SUV_MOTION,
        SUV_TYRES,
        options,
      );
      ticks.forEach((sample, tick) => {
        const ctx = terrainContext(ground, sample, tick);
        expect(b.step(sample.raw, ctx)).toStrictEqual(a.step(sample.raw, ctx));
      });
    }),
  );
});

function suvDrive(
  options: TransformingOptions,
  restored: { form?: Form } = {},
): TransformingDrive {
  return new TransformingDrive(
    0,
    restored,
    SUV_TRANSFORMING,
    SUV_MOTION,
    SUV_TYRES,
    options,
  );
}

/** A horizontal step that records what it was handed and steps as the default does. */
function spyStep(): { step: HorizontalStep; seen: () => HorizontalStepInput } {
  let last: HorizontalStepInput | undefined;
  return {
    step: (h) => {
      last = h;
      return transformingHorizontalStep(h);
    },
    seen: () => {
      if (last === undefined) throw new Error("the step was not called");
      return last;
    },
  };
}

it("hands the kind's mapping of this tick's input and resulting form to the horizontal step", () => {
  const inputFor: InputMapping = (raw, form) => ({
    throttle: form === "car" ? 0.5 : 0.25,
    steer: raw?.moveX ?? 0,
    handbrake: false,
    creep: false,
  });
  fc.assert(
    fc.property(stepTerrain, tickSequence, (ground, ticks) => {
      const spy = spyStep();
      const drive = suvDrive({ inputFor, horizontal: spy.step });
      ticks.forEach((sample, tick) => {
        drive.step(sample.raw, terrainContext(ground, sample, tick));
        expect(spy.seen().form).toBe(drive.form);
        expect(spy.seen().input).toStrictEqual(
          inputFor(sample.raw, drive.form),
        );
      });
    }),
  );
});

const unit = fc.double({ min: -1, max: 1, noNaN: true });
const fixedResult: fc.Arbitrary<MotionResult> = fc.record({
  state: fc.record({
    speed: unit,
    yaw: fc.double({ min: -180, max: 180, maxExcluded: true, noNaN: true }),
    stepTicks: fc.constant(0),
  }),
  forward: fc.record({ x: unit, z: unit }),
  impulse: fc.record({ x: unit, z: unit }),
  jumpVelocity: fc.double({ min: 0, max: 1, noNaN: true }),
  blocked: fc.boolean(),
});

it("moves by the horizontal step's result", () => {
  fc.assert(
    fc.property(
      fixedResult,
      stepTerrain,
      tickSequence,
      (result, ground, ticks) => {
        const drive = suvDrive({ horizontal: () => result });
        ticks.forEach((sample, tick) => {
          const out = drive.step(
            sample.raw,
            terrainContext(ground, sample, tick),
          );
          expect(drive.speed).toBe(result.state.speed);
          expect(drive.yaw).toBe(result.state.yaw);
          expect(out.forward).toStrictEqual(result.forward);
          expect(out.impulse.x).toBe(result.impulse.x);
          expect(out.impulse.z).toBe(result.impulse.z);
          if (drive.form === "car")
            expect(out.impulse.y).toBe(result.jumpVelocity);
        });
      },
    ),
  );
});

it("applies the guard to a kind's horizontal step", () => {
  fc.assert(
    fc.property(stepTerrain, tickSequence, (ground, ticks) => {
      const drive = suvDrive({
        horizontal: transformingHorizontalStep,
        guard: (s) => ({ ...s, impulse: { x: 7, z: -7 } }),
      });
      ticks.forEach((sample, tick) => {
        const out = drive.step(
          sample.raw,
          terrainContext(ground, sample, tick),
        );
        expect(out.impulse.x).toBe(7);
        expect(out.impulse.z).toBe(-7);
      });
    }),
  );
});

it("reports a Jump tap only on the tick Jump goes down", () => {
  const axis = fc.double({ min: -1, max: 1, noNaN: true });
  fc.assert(
    fc.property(
      fc.array(
        fc.option(fc.record({ moveX: axis, moveY: axis, jump: fc.boolean() }), {
          nil: undefined,
        }),
      ),
      (raws) => {
        for (const restored of [{}, { form: "hover" as const }]) {
          const spy = spyStep();
          const drive = suvDrive({ horizontal: spy.step }, restored);
          raws.forEach((raw, i) => {
            drive.step(raw, { ...context(), tick: i });
            expect(spy.seen().jumpTapped).toBe(
              (raw?.jump ?? false) && !(raws[i - 1]?.jump ?? false),
            );
          });
        }
      },
    ),
  );
});

it("carries the horizontal step's state into the next tick", () => {
  fc.assert(
    fc.property(
      stepTerrain,
      tickSequence,
      fc.array(fc.integer({ min: 0, max: 5 }), {
        minLength: 80,
        maxLength: 80,
      }),
      (ground, ticks, stepTicks) => {
        let seen: HorizontalStepInput | undefined;
        let returned: MotionResult | undefined;
        const drive = suvDrive({
          horizontal: (h) => {
            seen = h;
            const moved = transformingHorizontalStep(h);
            returned = {
              ...moved,
              state: { ...moved.state, stepTicks: stepTicks[h.ctx.tick] ?? 0 },
            };
            return returned;
          },
        });
        ticks.forEach((sample, tick) => {
          const previous = returned;
          drive.step(sample.raw, terrainContext(ground, sample, tick));
          if (previous !== undefined)
            expect(seen?.state).toStrictEqual(previous.state);
        });
      },
    ),
  );
});

it.each([
  ["SUV", SUV_TRANSFORMING, SUV_MOTION, SUV_TYRES],
  ["camper", CAMPER_TRANSFORMING, CAMPER_MOTION, CAMPER_TYRES],
] as const)(
  "%s with step-up off drives into a one-block step without hopping",
  (_name, spec, limits, tyres) => {
    const ctx: TickContext = {
      ...context(),
      onGround: true,
      velocity: { x: 0, y: 0, z: 0 },
      solidAt: (o) => o.y < 0 || (o.z >= spec.hitboxFront + 0.1 && o.y < 1),
    };
    const hopping = new TransformingDrive(0, {}, spec, limits, tyres);
    const flat = new TransformingDrive(0, {}, spec, limits, tyres, {
      stepUp: false,
    });
    let hops = 0;
    for (let tick = 0; tick < 40; tick++) {
      if (
        hopping.step(FORWARD, { ...ctx, tick }).impulse.y ===
        MOTION.oneStepVelocity
      )
        hops++;
      expect(flat.step(FORWARD, { ...ctx, tick }).impulse.y).toBe(0);
    }
    expect(hops).toBeGreaterThan(0);
  },
);

it("with step-up off only the landing gear reads solidAt", () => {
  fc.assert(
    fc.property(stepTerrain, tickSequence, (ground, ticks) => {
      const drive = suvDrive({ stepUp: false });
      ticks.forEach((sample, tick) => {
        const terrain = terrainContext(ground, sample, tick);
        let calls = 0;
        const out = drive.step(sample.raw, {
          ...terrain,
          solidAt: (o) => {
            calls++;
            return terrain.solidAt(o);
          },
        });
        if (drive.form !== "landing") expect(calls).toBe(0);
        if (drive.form === "car") expect(out.impulse.y).toBe(0);
      });
    }),
  );
});

// A one-block shore step ahead of the bow, where the probe dropped by
// submarineStepProbeDrop finds it (ADR 0035). Terrain solid everywhere above
// the drop leaves no headroom, so stepHeight would never find a step there.
const shoreStep: TickContext["solidAt"] = (o) =>
  o.z >= SUV_TRANSFORMING.hitboxFront + 0.1 &&
  o.y >= -SUV_TRANSFORMING.submarineStepProbeDrop &&
  o.y < 1 - SUV_TRANSFORMING.submarineStepProbeDrop;

function submarineImpulseWithoutRise(raw: RawInput, ctx: TickContext): number {
  const waterDepth = waterDepthAt(
    ctx.location,
    ctx.waterAt,
    SUV_TRANSFORMING.carHeight,
  );
  return verticalImpulse(
    submarineVerticalSpeed(
      { climb: climbInput(raw), controlled: true, rising: false, waterDepth },
      SUV_TRANSFORMING,
    ),
    ctx.velocity.y,
    SUV_TRANSFORMING.waterVerticalDrag,
  );
}

it("with step-up off a submarine rises only by climb and buoyancy", () => {
  fc.assert(
    fc.property(tickSequence, (ticks) => {
      const drive = suvDrive({ stepUp: false }, { form: "submarine" });
      ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
        const input = { ...raw, moveY: Math.abs(raw.moveY) };
        const ctx: TickContext = {
          ...context(SUV_TRANSFORMING.carHeight + depth),
          tick,
          velocity,
          onGround,
          solidAt: shoreStep,
        };
        const out = drive.step(input, ctx);
        if (drive.form !== "submarine") return;
        expect(out.impulse.y).toBe(submarineImpulseWithoutRise(input, ctx));
      });
    }),
  );
});

it("with step-up on a submarine rises at the same shore step", () => {
  const drive = suvDrive({}, { form: "submarine" });
  let rises = 0;
  for (let tick = 0; tick < 40; tick++) {
    const ctx: TickContext = {
      ...context(SUV_TRANSFORMING.carHeight + 1),
      tick,
      solidAt: shoreStep,
    };
    const out = drive.step(FORWARD, ctx);
    if (
      drive.form === "submarine" &&
      out.impulse.y !== submarineImpulseWithoutRise(FORWARD, ctx)
    )
      rises++;
  }
  expect(rises).toBeGreaterThan(0);
});

/** Flat ground with a one-block step just ahead of the front of the hitbox. */
function oneBlockStepAhead(spec: TransformingSpec): TickContext["solidAt"] {
  return (o) => o.y < 0 || (o.z >= spec.hitboxFront + 0.1 && o.y < 1);
}

/** A drive whose step-up follows a switch the test flips between ticks. */
class SwitchedStepUp extends TransformingDrive {
  stepUpOn = true;
  protected override stepUpEnabled(): boolean {
    return this.stepUpOn;
  }
}

function switched(
  options: TransformingOptions,
  restored: { form?: Form } = {},
): SwitchedStepUp {
  return new SwitchedStepUp(
    0,
    restored,
    SUV_TRANSFORMING,
    SUV_MOTION,
    SUV_TYRES,
    options,
  );
}

it("the default hook returns the stepUp option", () => {
  class ExposedStepUp extends TransformingDrive {
    enabled(): boolean {
      return this.stepUpEnabled();
    }
  }
  for (const options of [{}, { stepUp: true }, { stepUp: false }]) {
    const drive = new ExposedStepUp(
      0,
      {},
      SUV_TRANSFORMING,
      SUV_MOTION,
      SUV_TYRES,
      options,
    );
    expect(drive.enabled()).toBe(options.stepUp ?? true);
  }
});

it("a hook that returns a fixed value steps exactly like the matching stepUp option", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      stepTerrain,
      tickSequence,
      (on, ground, ticks) => {
        const drive = switched({ stepUp: !on });
        drive.stepUpOn = on;
        const reference = suvDrive({ stepUp: on });
        ticks.forEach((sample, tick) => {
          const ctx = terrainContext(ground, sample, tick);
          expect(drive.step(sample.raw, ctx)).toStrictEqual(
            reference.step(sample.raw, ctx),
          );
        });
      },
    ),
  );
});

// Starting in submarine form at a shore step is what reaches the submarine
// rising probe; the car-form run above never finds a step there.
it("a hook that returns a fixed value rises at a shore step exactly like the matching stepUp option", () => {
  fc.assert(
    fc.property(fc.boolean(), tickSequence, (on, ticks) => {
      const drive = switched({ stepUp: !on }, { form: "submarine" });
      drive.stepUpOn = on;
      const reference = suvDrive({ stepUp: on }, { form: "submarine" });
      ticks.forEach(({ raw, depth, velocity, onGround }, tick) => {
        const input = { ...raw, moveY: Math.abs(raw.moveY) };
        const ctx: TickContext = {
          ...context(SUV_TRANSFORMING.carHeight + depth),
          tick,
          velocity,
          onGround,
          solidAt: shoreStep,
        };
        expect(drive.step(input, ctx)).toStrictEqual(
          reference.step(input, ctx),
        );
      });
    }),
  );
});

it("on a tick with the hook off, only the landing gear reads solidAt", () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ sample: tickSample, on: fc.boolean() }), {
        minLength: 1,
        maxLength: 80,
      }),
      stepTerrain,
      (ticks, ground) => {
        const drive = switched({});
        ticks.forEach(({ sample, on }, tick) => {
          drive.stepUpOn = on;
          const terrain = terrainContext(ground, sample, tick);
          let calls = 0;
          const out = drive.step(sample.raw, {
            ...terrain,
            solidAt: (o) => {
              calls++;
              return terrain.solidAt(o);
            },
          });
          if (!on) {
            if (drive.form !== "landing") expect(calls).toBe(0);
            if (drive.form === "car") expect(out.impulse.y).toBe(0);
          }
        });
      },
    ),
  );
});

it("switching the hook on mid-drive starts hopping a one-block step, and switching it off stops it", () => {
  const drive = switched({});
  const ctx: TickContext = {
    ...context(),
    solidAt: oneBlockStepAhead(SUV_TRANSFORMING),
  };
  let hops = 0;
  for (let tick = 0; tick < 100; tick++) {
    drive.stepUpOn = tick >= 40 && tick < 80;
    const out = drive.step(FORWARD, { ...ctx, tick });
    if (!drive.stepUpOn) expect(out.impulse.y).toBe(0);
    else if (out.impulse.y === MOTION.oneStepVelocity) hops++;
  }
  expect(hops).toBeGreaterThan(0);
});

it("switching the hook per tick turns the submarine rising probe on and off", () => {
  const drive = switched({}, { form: "submarine" });
  let rises = 0;
  for (let tick = 0; tick < 80; tick++) {
    drive.stepUpOn = tick % 2 === 1;
    const ctx: TickContext = {
      ...context(SUV_TRANSFORMING.carHeight + 1),
      tick,
      solidAt: shoreStep,
    };
    const out = drive.step(FORWARD, ctx);
    const withoutRise = submarineImpulseWithoutRise(FORWARD, ctx);
    if (!drive.stepUpOn) expect(out.impulse.y).toBe(withoutRise);
    else if (drive.form === "submarine" && out.impulse.y !== withoutRise)
      rises++;
  }
  expect(rises).toBeGreaterThan(0);
});

it("never reads the hook during construction", () => {
  class ReadyStepUp extends TransformingDrive {
    private readonly ready = true;
    protected override stepUpEnabled(): boolean {
      if (this.ready !== true) throw new Error("read before step");
      return true;
    }
  }
  const build = () =>
    new ReadyStepUp(0, {}, SUV_TRANSFORMING, SUV_MOTION, SUV_TYRES);
  expect(build).not.toThrow();
  expect(() => build().step(FORWARD, context())).not.toThrow();
});
