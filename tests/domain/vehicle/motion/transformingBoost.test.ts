import { expect, it } from "vitest";
import type { Drive, TickContext } from "../../../../src/domain/vehicle/drive";
import {
  BOOST_CONTROL,
  CAMPER_ROOM,
  KINDS,
} from "../../../../src/domain/vehicle/kinds";
import { BULLDOZER_SPEC } from "../../../../src/domain/vehicle/kinds/bulldozer/spec";
import { CAMPER_SPEC } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SCOOTER_SPEC } from "../../../../src/domain/vehicle/kinds/scooter/spec";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import { TransformingDrive } from "../../../../src/domain/vehicle/motion/transformingDrive";
import { driveTicks } from "../../../support/engineModel";
import { waterSensors } from "../../../support/waterDepth";

const FORWARD = { moveX: 0, moveY: 1, jump: false };
const CLIMB = { ...FORWARD, jump: true };

function context(depth = 0): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    ...waterSensors(depth),
    blockTypes: () => [],
    solidAt: () => false,
  };
}

function enableBoost(drive: Drive) {
  const boost = drive.capability?.(BOOST_CONTROL);
  if (!boost) throw new Error("Expected flight boost control");
  expect(boost.isOn()).toBe(false);
  expect(boost.toggle()).toBe(true);
  expect(boost.isOn()).toBe(true);
  return boost;
}

const flyingKinds = [
  ["suv", SUV_SPEC],
  ["camper", CAMPER_SPEC],
  ["scooter", SCOOTER_SPEC],
  ["bulldozer", BULLDOZER_SPEC],
] as const;

it.each(flyingKinds)(
  "%s reaches triple flight speed at its normal acceleration",
  (kind, spec) => {
    const drive = KINDS[kind].createDrive(0, { form: "hover" });
    enableBoost(drive);
    const cap = spec.maxSpeed * 3;
    let ctx = context();
    for (let tick = 1; tick <= Math.ceil(cap / spec.accel) + 1; tick++) {
      ctx = driveTicks(drive, FORWARD, ctx, 1, spec.flightDrag);
      const expected = Math.min(tick * spec.accel, cap);
      expect(drive.speed).toBeCloseTo(expected, 10);
      expect(Math.hypot(ctx.velocity.x, ctx.velocity.z)).toBeCloseTo(
        expected,
        10,
      );
    }
  },
);

it.each(flyingKinds)(
  "%s triples the hover climb and dive limits",
  (kind, spec) => {
    const drive = KINDS[kind].createDrive(0, { form: "hover" });
    enableBoost(drive);
    const climb = drive.step(CLIMB, context());
    const dive = drive.step(
      { ...FORWARD, moveY: -1 },
      { ...context(), tick: 1 },
    );
    expect(climb.impulse.y * spec.flightVerticalDrag).toBeCloseTo(
      3 * spec.maxClimb,
    );
    expect(dive.impulse.y * spec.flightVerticalDrag).toBeCloseTo(
      -3 * spec.maxClimb,
    );
  },
);

it.each(["takeoff", "landing"] as const)(
  "preserves scripted vertical motion in %s",
  (form) => {
    const drive = KINDS.suv.createDrive(0, { form });
    const normal = KINDS.suv.createDrive(0, { form });
    enableBoost(drive);
    expect(drive.step(CLIMB, context()).impulse.y).toBe(
      normal.step(CLIMB, context()).impulse.y,
    );
  },
);

it.each([
  {
    form: "car",
    depth: 0,
    onGround: true,
    drag: MOTION.defaultFriction,
    cap: SUV_SPEC.maxSpeed,
  },
  {
    form: "submarine",
    depth: 8,
    onGround: false,
    drag: SUV_SPEC.waterDrag,
    cap: SUV_SPEC.maxWaterSpeed,
  },
])(
  "preserves the $form speed cap when boost is toggled on",
  ({ form, depth, onGround, drag, cap }) => {
    const drive = KINDS.suv.createDrive(0, { form });
    enableBoost(drive);
    driveTicks(drive, FORWARD, { ...context(depth), onGround }, 180, drag);
    expect(drive.speed).toBeCloseTo(cap, 10);
  },
);

it.each([
  "release",
  "touchdown",
  "sideways touchdown",
  "driver exit",
  "handover wait",
] as const)("bleeds the horizontal ceiling after %s", (event) => {
  const drive = KINDS.suv.createDrive(0, { form: "hover" });
  const boost = enableBoost(drive);
  const ctx = driveTicks(drive, FORWARD, context(), 180, SUV_SPEC.flightDrag);
  const sideways = event === "sideways touchdown";
  const touchdown = event === "touchdown" || sideways;
  const wait = event === "handover wait";
  const exit = event === "driver exit";
  const raw = exit
    ? undefined
    : sideways
      ? { moveX: 1, moveY: 0, jump: false }
      : FORWARD;
  if (event === "release") expect(boost.toggle()).toBe(false);
  const drag = touchdown ? MOTION.defaultFriction : SUV_SPEC.flightDrag;
  let next = { ...ctx, onGround: touchdown, awaitingDriver: wait };
  for (let tick = 1; tick <= 20; tick++) {
    const { impulse } = drive.step(raw, next);
    next = {
      ...next,
      tick: next.tick + 1,
      velocity: {
        x: (next.velocity.x + impulse.x) * drag,
        y: 0,
        z: (next.velocity.z + impulse.z) * drag,
      },
    };
    expect(drive.speed).toBeCloseTo(
      SUV_SPEC.maxSpeed * (3 - tick * MOTION.boostBleed),
      10,
    );
  }
});

it("returns immediately from boosted flight to the submarine cap on submergence", () => {
  const drive = KINDS.suv.createDrive(0, { form: "hover" });
  enableBoost(drive);
  const ctx = driveTicks(drive, FORWARD, context(), 180, SUV_SPEC.flightDrag);
  const out = drive.step(CLIMB, { ...ctx, ...waterSensors(8) });
  expect(drive.speed).toBeCloseTo(SUV_SPEC.maxWaterSpeed, 10);
  expect(out.impulse.y * SUV_SPEC.waterVerticalDrag).toBeCloseTo(
    SUV_SPEC.maxClimb,
  );
});

it("uses the normal climb limit during a driver handover wait", () => {
  const drive = KINDS.suv.createDrive(0, { form: "hover" });
  enableBoost(drive);
  const out = drive.step(CLIMB, { ...context(), awaitingDriver: true });
  expect(out.impulse.y * SUV_SPEC.flightVerticalDrag).toBeCloseTo(
    SUV_SPEC.maxClimb,
  );
});

it("clears boost when the next driver mounts and still offers the camper room", () => {
  const drive = KINDS.camper.createDrive(0, { form: "hover" });
  const boost = enableBoost(drive);
  expect(drive.capability?.(CAMPER_ROOM)).toBeDefined();
  drive.onDriverMounted(0);
  expect(boost.isOn()).toBe(false);
  const out = drive.step(CLIMB, context());
  expect(out.impulse.y * CAMPER_SPEC.flightVerticalDrag).toBeCloseTo(
    CAMPER_SPEC.maxClimb,
  );
});

it("offers no control for a transforming drive without a boost rule or for the sports boat", () => {
  const { boost: _boost, ...spec } = SUV_TRANSFORMING;
  const drive: Drive = new TransformingDrive(
    0,
    {},
    spec,
    SUV_MOTION,
    SUV_TYRES,
  );
  expect(drive.capability?.(BOOST_CONTROL)).toBeUndefined();
  expect(
    KINDS.sportsboat.createDrive(0, {}).capability?.(BOOST_CONTROL),
  ).toBeUndefined();
});
