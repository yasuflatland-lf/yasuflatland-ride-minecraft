import fc from "fast-check";
import { expect, it } from "vitest";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  CAMPER_AIR,
  CAMPER_SPEC,
  CAMPER_WATER,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";
import { type Body, engineStep } from "../../../../support/engineModel";

function context(): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: (offset) => offset.y < 0,
    waterAt: () => false,
    targets: () => [],
  };
}

it("reaches 95 percent speed in 60 to 90 ticks and stays within its cap for 300 ticks", () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 360, noNaN: true }), (yaw) => {
      const drive = new CamperDrive(yaw, {});
      let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
      let reach = -1;
      for (let tick = 0; tick < 300; tick++) {
        const out = drive.step(
          { moveX: 0, moveY: 1, jump: false },
          { ...context(), tick, velocity: { ...body.vel, y: 0 } },
        );
        expect(drive.speed).toBeLessThanOrEqual(CAMPER_SPEC.maxSpeed);
        if (reach < 0 && drive.speed >= CAMPER_SPEC.maxSpeed * 0.95)
          reach = tick;
        body = engineStep(body, out.impulse, {
          mu: MOTION.defaultFriction,
        }).body;
      }
      expect(reach).toBeGreaterThanOrEqual(60);
      expect(reach).toBeLessThanOrEqual(90);
      expect(drive.speed).toBeCloseTo(CAMPER_SPEC.maxSpeed, 9);
    }),
  );
});

it("keeps speed at zero when the front is against a four-block wall", () => {
  const drive = new CamperDrive(-90, {});
  const ctx = context();
  const wallX = ctx.location.x + CAMPER_SPEC.bodyFront;
  ctx.solidAt = (offset) =>
    offset.y < 0 ||
    (ctx.location.x + offset.x >= wallX && offset.y < CAMPER_SPEC.carHeight);
  for (let tick = 0; tick < 300; tick++) {
    const out = drive.step(
      { moveX: 0, moveY: 1, jump: false },
      { ...ctx, tick },
    );
    expect(drive.speed).toBe(0);
    expect(out.impulse.x).toBeCloseTo(0);
    expect(out.impulse.z).toBeCloseTo(0);
  }
});

it("restores hover form", () => {
  expect(new CamperDrive(0, { form: "hover" }).form).toBe("hover");
});

it.each([
  ["hover", CAMPER_AIR],
  ["submarine", CAMPER_WATER],
] as const)(
  "respects the camper's %s speed limit and compensates for its medium drag",
  (form, medium) => {
    const drive = new CamperDrive(-90, { form });
    const ctx = {
      ...context(),
      onGround: false,
      solidAt: () => false,
      waterAt: () => form === "submarine",
    };
    let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    for (let tick = 0; tick < 150; tick++) {
      const out = drive.step(
        { moveX: 0, moveY: 1, jump: false },
        { ...ctx, tick, velocity: { ...body.vel, y: 0 } },
      );
      body = engineStep(body, out.impulse, { mu: medium.drag }).body;
      expect(drive.form).toBe(form);
      expect(Math.hypot(body.vel.x, body.vel.z)).toBeLessThanOrEqual(
        medium.maxSpeed + 1e-9,
      );
    }
    expect(drive.speed).toBeCloseTo(medium.maxSpeed, 9);
    expect(Math.hypot(body.vel.x, body.vel.z)).toBeCloseTo(medium.maxSpeed, 9);
  },
);
