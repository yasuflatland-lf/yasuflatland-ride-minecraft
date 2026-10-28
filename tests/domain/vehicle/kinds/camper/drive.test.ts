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
import { dockedCommand } from "../../../../../src/domain/vehicle/motion/dockEntity";
import { type Body, engineStep } from "../../../../support/engineModel";

function context(): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    blockTypes: () => [],
    solidAt: (offset) => offset.y < 0,
    waterAt: () => false,
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

it("resync resends all room properties with current values while driving or parked", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (parked, open, lights, running) => {
        const drive = new CamperDrive(0, {
          docked: parked,
          door: open ? 1 : 0,
          shower_door: open ? 1 : 0,
          cabinet_sink_door: open ? 1 : 0,
          cabinet_stove_door: open ? 1 : 0,
          fridge_top_door: open ? 1 : 0,
          fridge_bottom_door: open ? 1 : 0,
          ceiling_lights: lights,
        });
        const raw = parked ? undefined : { moveX: 0, moveY: 1, jump: false };
        const current = new Map<string, unknown>();
        for (let tick = 0; tick < 40; tick++) {
          if (tick === 20 && running) expect(drive.runShower()).toBe(parked);
          for (const c of drive.step(raw, { ...context(), tick }).commands)
            if (c.type === "setProperty") current.set(c.name, c.value);
        }
        expect(drive.inspect().parked).toBe(parked);
        expect(current.get("shower")).toBe(parked && running);
        drive.resync();
        const out = drive.step(raw, { ...context(), tick: 40 });
        for (const name of [
          "door",
          "shower_door",
          "shower",
          "ceiling_lights",
          "cabinet_sink_door",
          "cabinet_stove_door",
          "fridge_top_door",
          "fridge_bottom_door",
        ]) {
          expect(current.has(name)).toBe(true);
          expect(out.commands).toContainEqual({
            type: "setProperty",
            name,
            value: current.get(name),
          });
        }
        // A camper that never parked keeps the entity's default docked value (ADR 0156).
        expect(
          out.commands.filter(
            (c) => c.type === "setProperty" && c.name === "docked",
          ),
        ).toStrictEqual(parked ? [dockedCommand(true)] : []);
        expect(
          out.commands.every(
            (c) => c.type === "setProperty" || c.type === "triggerEvent",
          ),
        ).toBe(true);
      },
    ),
  );
});

it("drops a saved oil lamp and a saved lantern at every heading", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -720, max: 720, noNaN: true }),
      fc.boolean(),
      (yaw, docked) => {
        const drive = new CamperDrive(yaw, {
          docked,
          dockDecor: JSON.stringify([
            { slot: "table", item: "oil_lamp" },
            { slot: "shelf", item: "lantern" },
          ]),
        });
        expect(drive.decor()).toEqual([]);
        const restored = new CamperDrive(yaw, {
          dockDecor: JSON.stringify(drive.decor()),
        });
        expect(restored.decor()).toEqual(drive.decor());
      },
    ),
  );
});
