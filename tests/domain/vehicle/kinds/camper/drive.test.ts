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

it("never lets the front pass a wall face while driving into it from any start", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 40, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(MOTION.defaultFriction, 0.6, 0.8),
      (gap, cellOffset, mu) => {
        const drive = new CamperDrive(-90, {});
        const wallX = 60;
        let body: Body = {
          pos: { x: wallX - CAMPER_SPEC.bodyFront - gap - cellOffset, z: 0.5 },
          vel: { x: 0, z: 0 },
        };
        for (let tick = 0; tick < 200; tick++) {
          const location = { x: body.pos.x, y: 64, z: body.pos.z };
          const out = drive.step(
            { moveX: 0, moveY: 1, jump: false },
            {
              ...context(),
              tick,
              location,
              velocity: { ...body.vel, y: 0 },
              solidAt: (offset) =>
                offset.y < 0 ||
                (Math.floor(location.x + offset.x) >= wallX &&
                  offset.y < CAMPER_SPEC.carHeight),
            },
          );
          body = engineStep(body, out.impulse, { mu }).body;
          expect(body.pos.x + CAMPER_SPEC.bodyFront).toBeLessThanOrEqual(
            wallX + 1e-9,
          );
        }
      },
    ),
  );
});

it("never lets the front pass a one-thick wall while driving into it from any start", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 40, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(MOTION.defaultFriction, 0.6, 0.8),
      (gap, cellOffset, mu) => {
        const drive = new CamperDrive(-90, {});
        const wallX = 60;
        let body: Body = {
          pos: { x: wallX - CAMPER_SPEC.bodyFront - gap - cellOffset, z: 0.5 },
          vel: { x: 0, z: 0 },
        };
        let stopped = false;
        for (let tick = 0; tick < 200; tick++) {
          const location = { x: body.pos.x, y: 64, z: body.pos.z };
          const out = drive.step(
            { moveX: 0, moveY: 1, jump: false },
            {
              ...context(),
              tick,
              location,
              velocity: { ...body.vel, y: 0 },
              solidAt: (offset) =>
                offset.y < 0 ||
                (Math.floor(location.x + offset.x) === wallX &&
                  offset.y < CAMPER_SPEC.carHeight),
            },
          );
          body = engineStep(body, out.impulse, { mu }).body;
          expect(body.pos.x + CAMPER_SPEC.bodyFront).toBeLessThanOrEqual(
            wallX + 1e-9,
          );
          stopped ||= drive.speed === 0 && tick > 0;
        }
        expect(stopped).toBe(true);
      },
    ),
  );
});

it("cancels the step jump when a curb lies ahead and a wall stands at the front end", () => {
  const drive = new CamperDrive(-90, {});
  const ctx = context();
  const wallX = ctx.location.x + CAMPER_SPEC.bodyFront;
  ctx.solidAt = (offset) => {
    const x = ctx.location.x + offset.x;
    if (offset.y < 0) return true;
    if (x >= wallX) return offset.y < CAMPER_SPEC.carHeight;
    return x >= ctx.location.x + CAMPER_SPEC.hitboxFront && offset.y < 1;
  };
  for (let tick = 0; tick < 100; tick++) {
    const out = drive.step(
      { moveX: 0, moveY: 1, jump: false },
      { ...ctx, tick },
    );
    expect(drive.speed).toBe(0);
    expect(out.impulse.y).toBe(0);
    expect(out.impulse.x).toBeCloseTo(0);
    expect(out.impulse.z).toBeCloseTo(0);
  }
});

it.each([
  ["hover", 0],
  ["hover", 2],
  ["submarine", 0],
  ["submarine", 3],
] as const)(
  "stops a %s camper at a wall in layer %i at the front end",
  (form, layer) => {
    const drive = new CamperDrive(-90, { form });
    const location = { x: 0.5, y: 64, z: 0.5 };
    const wallX = location.x + CAMPER_SPEC.bodyFront;
    const ctx: TickContext = {
      ...context(),
      location,
      onGround: false,
      velocity: { x: 0.3, y: 0, z: 0.1 },
      solidAt: (offset) => location.x + offset.x >= wallX && offset.y === layer,
      waterAt: () => form === "submarine",
    };
    for (let tick = 0; tick < 100; tick++) {
      const out = drive.step(
        { moveX: 0, moveY: 1, jump: false },
        { ...ctx, tick },
      );
      expect(drive.form).toBe(form);
      expect(drive.speed).toBe(0);
      expect(out.impulse.x).toBeCloseTo(-ctx.velocity.x);
      expect(out.impulse.z).toBeCloseTo(-ctx.velocity.z);
    }
  },
);
