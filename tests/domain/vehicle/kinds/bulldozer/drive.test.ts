import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp, normalizeYaw } from "../../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { toDriveInput } from "../../../../../src/domain/vehicle/driveInput";
import { bladeColumns } from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import {
  BulldozerDrive,
  bulldozerHorizontalStep,
  bulldozerInput,
  cutReach,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BULLDOZER_MOTION as limits,
  BULLDOZER_TYRES as tyres,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  BULLDOZER_SPEC as S,
  BULLDOZER_TRANSFORMING as spec,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import { SuvDrive } from "../../../../../src/domain/vehicle/kinds/suv/drive";
import { FORMS } from "../../../../../src/domain/vehicle/motion/forms";
import { initialMotion } from "../../../../../src/domain/vehicle/motion/motion";
import {
  pivotGroundStep,
  pivotMediumStep,
} from "../../../../../src/domain/vehicle/motion/pivot";
import {
  type HorizontalStepInput,
  transformingHorizontalStep,
} from "../../../../../src/domain/vehicle/motion/transformingDrive";
import { formCommands } from "../../../../../src/domain/vehicle/motion/transformingEntity";
import { propertyValue } from "../../../../support/engineCommands";
import { type Body, engineStep } from "../../../../support/engineModel";
import { waterSensors } from "../../../../support/waterDepth";

const IDLE = { moveX: 0, moveY: 0, jump: false };
const FORWARD = { ...IDLE, moveY: 1 };
function context(depth = 0): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(depth),
    blockTypes: () => [],
    solidAt: (o) => o.y < 0,
  };
}
const unit = fc.double({ min: -1, max: 1, noNaN: true });
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
it("never handbrakes or creeps; a sideways stick past pivotStick pivots and anything else drives straight", () => {
  fc.assert(
    fc.property(
      unit,
      unit,
      fc.boolean(),
      fc.constantFrom(...FORMS),
      (moveX, moveY, jump, form) => {
        const raw = { moveX, moveY, jump };
        const steer =
          form === "takeoff"
            ? 0
            : Math.abs(moveX) > 0.35
              ? clamp(moveX, -1, 1)
              : 0;
        const throttle =
          form === "takeoff" || steer !== 0
            ? 0
            : form === "car"
              ? toDriveInput(raw).throttle
              : Math.max(0, toDriveInput(raw).throttle);
        expect(bulldozerInput(raw, form)).toEqual({
          throttle,
          steer,
          handbrake: false,
          creep: false,
        });
      },
    ),
  );
  for (const raw of [
    undefined,
    { ...IDLE, moveX: Number.NaN },
    { ...IDLE, moveY: Infinity },
  ])
    expect(bulldozerInput(raw, "car")).toEqual({
      throttle: 0,
      steer: 0,
      handbrake: false,
      creep: false,
    });
});
it("hops only on a Jump tap in car form on the ground", () =>
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom(...FORMS),
      (jumpTapped, onGround, form) => {
        const h: HorizontalStepInput = {
          state: initialMotion(0),
          input: bulldozerInput(IDLE, form),
          ctx: { ...context(), onGround },
          form,
          jumpTapped,
          probe: () => 0,
          spec,
          limits,
          tyres,
        };
        const out = bulldozerHorizontalStep(h);
        expect(out.jumpVelocity).toBe(
          jumpTapped && onGround && form === "car" ? S.hopVelocity : 0,
        );
        if (out.jumpVelocity) expect(out.state.stepTicks).toBe(S.hopTicks - 1);
      },
    ),
  ));
it("pivots with steer and drives straight otherwise, in every form", () =>
  fc.assert(
    fc.property(unit, yaw, fc.constantFrom(...FORMS), (steer, yaw, form) => {
      const h: HorizontalStepInput = {
        state: initialMotion(yaw),
        input: { throttle: 0, steer, creep: false, handbrake: false },
        ctx: context(),
        form,
        jumpTapped: false,
        probe: () => 0,
        spec,
        limits,
        tyres,
      };
      const v = { x: 0, z: 0 };
      const expected =
        steer === 0
          ? transformingHorizontalStep(h)
          : form === "car"
            ? pivotGroundStep(
                h.state,
                steer,
                { velocity: v, onGround: true },
                h.probe,
                limits,
                tyres,
              )
            : pivotMediumStep(
                h.state,
                steer,
                v,
                form === "submarine" ? spec.water : spec.air,
                limits,
              );
      expect(bulldozerHorizontalStep(h)).toEqual(expected);
    }),
  ));
it("keeps its heading while driving forward or back", () =>
  fc.assert(
    fc.property(
      yaw,
      fc.double({ min: -0.35, max: 0.35, noNaN: true }),
      unit,
      (heading, moveX, moveY) => {
        const d = new BulldozerDrive(heading, {});
        let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        for (let tick = 0; tick < 60; tick++) {
          const out = d.step(
            { ...IDLE, moveX, moveY },
            { ...context(), tick, velocity: { ...body.vel, y: 0 } },
          );
          body = engineStep(body, out.impulse, { mu: 0.69 }).body;
          expect(d.yaw).toBeCloseTo(normalizeYaw(heading), 9);
        }
      },
    ),
  ));
it("pivots on the spot from top speed, braking to a stop without reversing", () => {
  const d = new BulldozerDrive(0, {});
  let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 80; tick++) {
    const before = d.speed;
    const heading = d.yaw;
    const out = d.step(tick < 50 ? FORWARD : { ...IDLE, moveX: 1 }, {
      ...context(),
      tick,
      velocity: { ...body.vel, y: 0 },
    });
    body = engineStep(body, out.impulse, { mu: 0.69 }).body;
    if (tick === 49) expect(d.speed).toBe(0.45);
    if (tick >= 50) {
      expect(d.speed).toBeCloseTo(Math.max(0, before - 0.02), 9);
      expect(normalizeYaw(d.yaw - heading)).toBe(-3);
      expect(d.speed).toBeGreaterThanOrEqual(0);
    }
  }
});
it("hops one block on a Jump tap on the ground", () => {
  const d = new BulldozerDrive(0, {});
  expect(d.step({ ...IDLE, jump: true }, context()).impulse.y).toBe(
    S.hopVelocity,
  );
  expect(d.form).toBe("car");
  expect(
    d.step({ ...IDLE, jump: true }, { ...context(), tick: 1 }).impulse.y,
  ).toBe(0);
  expect(
    new BulldozerDrive(0, {}).step(
      { ...IDLE, jump: true },
      { ...context(), onGround: false },
    ).impulse.y,
  ).toBe(0);
});
it("takes off on a second tap within 8 ticks", () => {
  const d = new BulldozerDrive(0, {});
  for (let tick = 0; tick <= 4; tick++) {
    const out = d.step(
      { ...IDLE, jump: tick === 0 || tick === 4 },
      { ...context(), tick },
    );
    if (tick === 4) {
      expect(d.form).toBe("takeoff");
      expect(out.impulse.y).not.toBe(S.hopVelocity);
    }
  }
});
it("never steps up onto a block ahead, where the SUV would", () => {
  const d = new BulldozerDrive(0, {}),
    suv = new SuvDrive(0, {});
  let rises = false;
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  let s = b;
  for (let tick = 0; tick < 30; tick++) {
    const ctx = { ...context(), tick, solidAt: (o: { y: number }) => o.y < 1 };
    const out = d.step(FORWARD, { ...ctx, velocity: { ...b.vel, y: 0 } });
    const other = suv.step(FORWARD, { ...ctx, velocity: { ...s.vel, y: 0 } });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    s = engineStep(s, other.impulse, { mu: 0.69 }).body;
    expect(out.impulse.y).toBe(0);
    rises ||= other.impulse.y > 0;
  }
  expect(rises).toBe(true);
});
it("does not rise from the submarine step probe", () => {
  const a = new BulldozerDrive(0, { form: "submarine" }),
    b = new BulldozerDrive(0, { form: "submarine" });
  expect(
    a.step(FORWARD, { ...context(3), solidAt: (o) => o.y < 1 }).impulse.y,
  ).toBe(
    b.step(FORWARD, { ...context(3), solidAt: (o) => o.y < -1 }).impulse.y,
  );
});
it("never banks", () =>
  fc.assert(
    fc.property(unit, unit, (moveX, moveY) => {
      const d = new BulldozerDrive(0, { form: "hover" });
      const v = propertyValue(
        d.step({ ...IDLE, moveX, moveY }, { ...context(), onGround: false })
          .commands,
        "bank",
      );
      expect(v === undefined || v === 0).toBe(true);
    }),
  ));
it("cuts from the feet to the sky in car form on the ground while moving forward (ADR 0137)", () => {
  const d = new BulldozerDrive(0, {});
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 10; tick++) {
    const ctx = {
      ...context(),
      tick,
      location: { ...b.pos, y: 64 },
      velocity: { ...b.vel, y: 0 },
    };
    const out = d.step(FORWARD, ctx);
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    if (tick === 9)
      expect(out.cut).toEqual(
        bladeColumns(ctx.location, d.yaw, S.blade, false),
      );
  }
});
it("cuts the body's height in takeoff, hover and landing", () => {
  for (const form of ["takeoff", "hover", "landing"] as const) {
    const d = new BulldozerDrive(0, { form });
    let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    for (let tick = 0; tick < 30; tick++) {
      const out = d.step(FORWARD, {
        ...context(),
        tick,
        location: { ...b.pos, y: 64.5 },
        onGround: false,
        solidAt: () => false,
        velocity: { ...b.vel, y: 0 },
      });
      b = engineStep(b, out.impulse, { mu: 0.69, drag: 0.91 }, false).body;
      for (const c of out.cut ?? [])
        expect(c.bottom + (c.height ?? 0)).toBe(68);
    }
    expect(d.speed).toBeGreaterThan(0.02);
  }
});
it("cuts nothing in a hop, off a ledge, under water, reversing, standing, pivoting, at 0.02 or below, or without input", () =>
  fc.assert(
    fc.property(
      fc.constantFrom(...FORMS),
      fc.boolean(),
      unit,
      (form, onGround, moveY) => {
        const d = new BulldozerDrive(0, { form });
        const out = d.step(
          { ...IDLE, moveY },
          { ...context(form === "submarine" ? 3 : 0), onGround },
        );
        expect(out.cut ?? []).toEqual([]);
      },
    ),
  ));
it("maps forms to the cut reach", () => {
  for (const f of FORMS)
    for (const ground of [true, false])
      expect(cutReach(f, ground)).toBe(
        f === "car"
          ? ground
            ? "sky"
            : undefined
          : f === "submarine"
            ? undefined
            : "tunnel",
      );
});
it("runs the tracks opposite ways on a pivot", () => {
  const d = new BulldozerDrive(0, {});
  const values: Record<string, unknown> = {};
  for (let tick = 0; tick < 10; tick++)
    for (const c of d.step({ ...IDLE, moveX: 1 }, { ...context(), tick })
      .commands)
      if (c.type === "setProperty") values[c.name] = c.value;
  expect(values).toMatchObject({
    spin_r: 64,
    spin_l: 296,
    track_r: 2,
    track_l: 0,
  });
});
it("stops the tracks out of car form", () => {
  const d = new BulldozerDrive(0, { form: "hover" });
  d.step(IDLE, { ...context(), onGround: false });
  for (let tick = 1; tick < 10; tick++)
    expect(
      d
        .step({ ...IDLE, moveX: 1 }, { ...context(), tick, onGround: false })
        .commands.filter((c) => /^(track|spin)_/.test(c.name)),
    ).toEqual([]);
});
it("sends each track value only when it changes, and all again after resync", () => {
  const d = new BulldozerDrive(0, {});
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  let found = false;
  for (let tick = 0; tick < 60; tick++) {
    const out = d.step(
      { ...IDLE, moveX: 0.36 },
      { ...context(), tick, velocity: { ...b.vel, y: 0 } },
    );
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    const names = out.commands.map((c) => c.name);
    if (names.includes("spin_r") && !names.includes("track_r")) {
      found = true;
      expect(names).not.toContain("track_r");
    }
  }
  expect(found).toBe(true);
  d.resync();
  const out = d.step(IDLE, context());
  for (const key of ["door", "track_r", "track_l", "spin_r", "spin_l"])
    expect(propertyValue(out.commands, key)).toBeDefined();
});
it("opens the left door for 2 seconds when the seat is taken or left", () => {
  for (const hook of ["onSeatTaken", "onSeatVacated"] as const) {
    const d = new BulldozerDrive(0, {});
    expect(d[hook](0)).toEqual([]);
    let door = 0;
    for (let k = 1; k <= 55; k++) {
      const out = d.step(IDLE, { ...context(), tick: k });
      door = Number(propertyValue(out.commands, "door") ?? door);
      expect(door).toBe(
        k < 10 ? k / 10 : k < 40 ? 1 : Math.max(0, (49 - k) / 10),
      );
    }
    d[hook](0);
    for (let k = 0; k < 30; k++) d.step(IDLE, context());
    d[hook](0);
    let last = 1;
    for (let k = 1; k <= 39; k++)
      last = Number(
        propertyValue(d.step(IDLE, context()).commands, "door") ?? last,
      );
    expect(last).toBe(1);
  }
});
it("keeps flying after a restart and resends its state", () => {
  const d = new BulldozerDrive(0, { form: "hover" });
  const first = d.step(IDLE, { ...context(), onGround: false });
  expect(first.commands.slice(0, 2)).toEqual(formCommands("hover"));
  d.resync();
  const out = d.step(IDLE, { ...context(), tick: 1, onGround: false });
  for (const key of ["door", "track_r", "track_l", "spin_r", "spin_l"])
    expect(propertyValue(out.commands, key)).toBeDefined();
});
