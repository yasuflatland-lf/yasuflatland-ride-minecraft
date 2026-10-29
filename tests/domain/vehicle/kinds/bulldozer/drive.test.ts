import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp, normalizeYaw } from "../../../../../src/domain/shared/vec";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { toDriveInput } from "../../../../../src/domain/vehicle/driveInput";
import { bladeColumns } from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import {
  BulldozerDrive,
  bulldozerHorizontalStep,
  bulldozerInput,
  cutReach,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH_ITEM,
  ROAD_PAVER_SWITCH_ITEM,
  WIDE_BLADE_SWITCH_ITEM,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/monitor";
import {
  BULLDOZER_PROFILE,
  BULLDOZER_MOTION as limits,
  BULLDOZER_TYRES as tyres,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  BULLDOZER_WIDE_BLADE,
  BULLDOZER_SPEC as S,
  BULLDOZER_TRANSFORMING as spec,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  advanceTracks,
  trackPhase,
  trackSpin,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/tracks";
import { SuvDrive } from "../../../../../src/domain/vehicle/kinds/suv/drive";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";
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
import { ramHalfWidthLimit } from "../../../../../src/domain/vehicle/profile";
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
it("keeps the higher of a hop and a step jump (ADR 0138)", () =>
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom(...FORMS),
      fc.constantFrom(0, 1, 2),
      fc.double({ min: 0, max: S.maxSpeed, noNaN: true }),
      (jumpTapped, onGround, form, height, speed) => {
        const h: HorizontalStepInput = {
          state: { ...initialMotion(0), speed },
          input: bulldozerInput(FORWARD, form),
          ctx: { ...context(), onGround },
          form,
          jumpTapped,
          probe: () => height,
          spec,
          limits,
          tyres,
        };
        const base = transformingHorizontalStep(h).jumpVelocity;
        const hops = jumpTapped && onGround && form === "car";
        const out = bulldozerHorizontalStep(h);
        expect(out.jumpVelocity).toBe(
          hops ? Math.max(base, S.hopVelocity) : base,
        );
        if (hops) expect(out.state.stepTicks).toBe(S.hopTicks - 1);
      },
    ),
  ));
it("keeps the two-block step jump when Jump is tapped against the step", () => {
  const out = bulldozerHorizontalStep({
    state: { ...initialMotion(0), speed: S.maxSpeed },
    input: bulldozerInput(FORWARD, "car"),
    ctx: context(),
    form: "car",
    jumpTapped: true,
    probe: () => 2,
    spec,
    limits,
    tyres,
  });
  expect(MOTION.stepVelocity).toBeGreaterThan(S.hopVelocity);
  expect(out.jumpVelocity).toBe(MOTION.stepVelocity);
  expect(out.state.stepTicks).toBe(S.hopTicks - 1);
});
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
it("never steps up onto a block ahead with the blade lowered, where the SUV would", () => {
  const d = new BulldozerDrive(0, { blade: 0 }),
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
it("does not rise from the submarine step probe with the blade lowered", () => {
  const a = new BulldozerDrive(0, { form: "submarine", blade: 0 }),
    b = new BulldozerDrive(0, { form: "submarine", blade: 0 });
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
  const d = new BulldozerDrive(0, { blade: 0 });
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
  const d = new BulldozerDrive(0, { blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const seen = new Set<string>();
  for (let tick = 0; tick < 100; tick++) {
    const jump = tick === 50 || tick === 54 || tick === 80 || tick === 84;
    const ground = tick < 51;
    const ctx = {
      ...context(),
      tick,
      location: { ...b.pos, y: 64.5 },
      onGround: ground,
      solidAt: () => false,
      velocity: { ...b.vel, y: 0 },
    };
    const out = d.step({ ...FORWARD, jump }, ctx);
    b = engineStep(
      b,
      out.impulse,
      { mu: 0.69, drag: ground ? 0.69 : 0.91 },
      ground,
    ).body;
    if (["takeoff", "hover", "landing"].includes(d.form)) {
      seen.add(d.form);
      expect(out.cut?.length).toBeGreaterThan(0);
      for (const c of out.cut ?? [])
        expect(c.bottom + (c.height ?? 0)).toBe(68);
    }
  }
  expect([...seen].sort()).toEqual(["hover", "landing", "takeoff"]);
});
it("cuts nothing off a ledge, reversing, standing, pivoting, or without input", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("ledge", "reverse", "standing", "pivot", "no input"),
      yaw,
      (condition, heading) => {
        const d = new BulldozerDrive(heading, { blade: 0 });
        let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        for (let tick = 0; tick < 60; tick++) {
          const checking = tick >= 50;
          let raw: RawInput | undefined = FORWARD;
          let onGround = true;
          if (condition === "reverse") raw = { ...IDLE, moveY: -1 };
          if (condition === "standing") raw = IDLE;
          if (checking) {
            if (condition === "ledge") onGround = false;
            if (condition === "pivot") raw = { ...IDLE, moveX: 1 };
            if (condition === "no input") raw = undefined;
          }
          const ctx = {
            ...context(),
            tick,
            onGround,
            velocity: { ...b.vel, y: 0 },
          };
          const out = d.step(raw, ctx);
          b = engineStep(b, out.impulse, { mu: 0.69 }, onGround).body;
          if (checking) expect(out.cut ?? []).toEqual([]);
        }
      },
    ),
  );
});
it("cuts on the hop tick, still on the ground, but not in the air after it", () => {
  const d = new BulldozerDrive(0, { blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 60; tick++) {
    const onGround = tick <= 50;
    const ctx = {
      ...context(),
      tick,
      location: { ...b.pos, y: 64 },
      onGround,
      velocity: { ...b.vel, y: 0 },
    };
    const out = d.step({ ...FORWARD, jump: tick === 50 }, ctx);
    b = engineStep(b, out.impulse, { mu: 0.69 }, onGround).body;
    if (tick === 50) {
      expect(out.impulse.y).toBeGreaterThan(0);
      expect(out.cut).toEqual(
        bladeColumns(ctx.location, d.yaw, S.blade, false),
      );
    }
    if (tick > 50) expect(out.cut ?? []).toEqual([]);
  }
});
it("cuts only above blade.minSpeed while driving forward", () => {
  const d = new BulldozerDrive(0, { blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const speeds = { slow: 0, fast: 0 };
  for (let tick = 0; tick < 10; tick++) {
    const out = d.step(FORWARD, {
      ...context(),
      tick,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    const fast = d.speed > S.blade.minSpeed;
    if (d.speed > 0) speeds[fast ? "fast" : "slow"]++;
    expect((out.cut ?? []).length > 0).toBe(fast);
  }
  expect(speeds.slow).toBeGreaterThan(0);
  expect(speeds.fast).toBeGreaterThan(0);
});
it("maps forms to the cut reach", () => {
  for (const f of FORMS)
    for (const ground of [true, false])
      expect(cutReach(f, ground)).toBe(
        f === "car" ? (ground ? "sky" : undefined) : "tunnel",
      );
});
function driveSubmarine(
  raw: (tick: number) => RawInput | undefined,
  onGround: boolean,
  y = 40,
): { d: BulldozerDrive; steps: { ctx: TickContext; out: DriveStep }[] } {
  const d = new BulldozerDrive(0, { form: "submarine", blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const steps: { ctx: TickContext; out: DriveStep }[] = [];
  for (let tick = 0; tick < 10; tick++) {
    const ctx = {
      ...context(3),
      tick,
      location: { ...b.pos, y },
      onGround,
      solidAt: () => false,
      velocity: { ...b.vel, y: 0 },
    };
    const out = d.step(raw(tick), ctx);
    steps.push({ ctx, out });
    b = engineStep(b, out.impulse, { mu: 0.69, drag: 0.83 }, false).body;
  }
  return { d, steps };
}
it("tunnels through rock under water from the pre-step location, without a shaft in open water (ADR 0155)", () => {
  const { d, steps } = driveSubmarine(() => FORWARD, false);
  for (const { ctx, out } of steps.slice(5))
    expect(out.cut).toEqual(
      bladeColumns(ctx.location, d.yaw, S.blade, true, false),
    );
});
it("keeps the seabed floor row when the submarine rests on the bottom (ADR 0155)", () => {
  const { steps } = driveSubmarine(() => FORWARD, true, 39.875);
  const cut = steps.at(-1)?.out.cut ?? [];
  expect(cut.length).toBeGreaterThan(0);
  for (const c of cut) {
    expect(c.bottom).toBe(40);
    expect(c.bottom + (c.height ?? 0)).toBe(43);
  }
});
it("cuts nothing under water while pivoting or without input", () => {
  for (const raw of [{ ...IDLE, moveX: 1 }, undefined]) {
    const { steps } = driveSubmarine(
      (tick) => (tick < 5 ? FORWARD : raw),
      false,
    );
    for (const { out } of steps.slice(5)) expect(out.cut ?? []).toEqual([]);
  }
});
/** The cells of an axis-aligned square reaching `half` from `center`, counting every cell the open interval touches. */
function cellsAcross(center: number, half: number): number[] {
  const cells: number[] = [];
  for (
    let c = Math.floor(center - half);
    c <= Math.ceil(center + half) - 1;
    c++
  )
    cells.push(c);
  return cells;
}
it("digs the wide shaft only while rising with a solid block in the two cells over the footprint (ADR 0155)", () => {
  const wide = S.footprint / 2 + S.shaft.margin;
  const fraction = fc.double({ min: 0, max: 0.999, noNaN: true });
  fc.assert(
    fc.property(
      fc.constantFrom("takeoff", "hover", "submarine"),
      fc.boolean(),
      fraction,
      fraction,
      fraction,
      fc.nat(8),
      fc.nat(8),
      fc.integer({ min: -1, max: 2 }),
      (form, rising, fx, fy, fz, i, k, dy) => {
        const location = { x: 10 + fx, y: 40 + fy, z: -3 + fz };
        const top = Math.floor(location.y + S.carHeight);
        const xs = cellsAcross(location.x, wide);
        const zs = cellsAcross(location.z, wide);
        const roof = {
          x: xs[i % xs.length] ?? 0,
          y: top + dy,
          z: zs[k % zs.length] ?? 0,
        };
        const d = new BulldozerDrive(0, { form, blade: 0 });
        const ctx = {
          ...context(form === "submarine" ? 3 : 0),
          onGround: false,
          location,
          solidAt: (o: { x: number; y: number; z: number }) =>
            Math.floor(location.x + o.x) === roof.x &&
            Math.floor(location.y + o.y) === roof.y &&
            Math.floor(location.z + o.z) === roof.z,
        };
        d.step({ ...IDLE, jump: rising }, ctx);
        const out = d.step({ ...IDLE, jump: rising }, { ...ctx, tick: 1 });
        const overFootprint =
          cellsAcross(location.x, S.footprint / 2).includes(roof.x) &&
          cellsAcross(location.z, S.footprint / 2).includes(roof.z) &&
          dy >= 0 &&
          dy < S.shaft.reach;
        if (!((form === "takeoff" || rising) && overFootprint)) {
          expect(out.cut ?? []).toEqual([]);
          return;
        }
        const expected = xs.flatMap((x) =>
          zs.map((z) => ({ x, z, bottom: top, height: S.shaft.reach })),
        );
        const key = (c: { x: number; z: number }) => `${c.x},${c.z}`;
        const cut = out.cut ?? [];
        expect(cut).toHaveLength(expected.length);
        expect(new Set(cut.map(key)).size).toBe(expected.length);
        expect([...cut].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
          [...expected].sort((a, b) => key(a).localeCompare(key(b))),
        );
      },
    ),
  );
});
it("digs no shaft with the blade raised or with no driver under a roof in reach, nor under a roof out of reach (ADR 0155)", () => {
  const ctx = {
    ...context(3),
    onGround: false,
    location: { x: 0.5, y: 40, z: 0.5 },
  };
  // The body's top is in cell 42, so offsets 2.5 and 3.5 are the probed cells.
  const inReach = (o: { y: number }) => o.y >= 2;
  const outOfReach = (o: { y: number }) => o.y >= 4;
  const up = { ...IDLE, jump: true };
  const lowered = new BulldozerDrive(0, { form: "submarine", blade: 0 });
  const raised = new BulldozerDrive(0, { form: "submarine", blade: 1 });
  const idle = new BulldozerDrive(0, { form: "submarine", blade: 0 });
  const far = new BulldozerDrive(0, { form: "submarine", blade: 0 });
  for (let tick = 0; tick < 12; tick++) {
    const near = { ...ctx, tick, solidAt: inReach };
    expect(lowered.step(up, near).cut?.length).toBeGreaterThan(0);
    expect(raised.step(up, near).cut ?? []).toEqual([]);
    expect(idle.step(undefined, near).cut ?? []).toEqual([]);
    expect(
      far.step(up, { ...ctx, tick, solidAt: outOfReach }).cut ?? [],
    ).toEqual([]);
  }
});
it("runs the tracks opposite ways on a pivot", () => {
  const d = new BulldozerDrive(0, {});
  const values: Record<string, unknown> = {};
  let travel = { r: 0, l: 0 };
  for (let tick = 0; tick < 10; tick++) {
    travel = advanceTracks(travel, 0, -3, S.tracks);
    for (const c of d.step({ ...IDLE, moveX: 1 }, { ...context(), tick })
      .commands)
      if (c.type === "setProperty") values[c.name] = c.value;
  }
  expect(values).toMatchObject({
    spin_r: 64,
    spin_l: 296,
    track_r: 2,
    track_l: 0,
  });
  expect(values).toMatchObject({
    spin_r: trackSpin(travel.r, S.tracks.radius),
    spin_l: trackSpin(travel.l, S.tracks.radius),
    track_r: trackPhase(travel.r, S.tracks.phaseStep),
    track_l: trackPhase(travel.l, S.tracks.phaseStep),
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
  const last: Record<string, unknown> = {};
  let onlyRight = false;
  for (let tick = 0; tick < 200; tick++) {
    const raw =
      tick % 37 < 3
        ? { ...IDLE, moveX: 0.371 }
        : tick % 37 < 9
          ? { ...IDLE, moveY: 0.11 }
          : IDLE;
    const before = { ...last };
    const out = d.step(raw, {
      ...context(),
      tick,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    const tracks = out.commands.filter((c) => /^(track|spin)_/.test(c.name));
    for (const c of tracks)
      if (c.type === "setProperty") {
        if (tick > 0) expect(c.value).not.toBe(before[c.name]);
        last[c.name] = c.value;
      }
    if (tracks.length === 1 && tracks[0]?.name === "spin_r") onlyRight = true;
  }
  expect(onlyRight).toBe(true);
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
  for (const key of ["door", "blade", "track_r", "track_l", "spin_r", "spin_l"])
    expect(propertyValue(out.commands, key)).toBeDefined();
});

it("cuts a full body tunnel while moving after a restart", () => {
  const d = new BulldozerDrive(0, { form: "hover", blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 20; tick++) {
    const out = d.step(FORWARD, {
      ...context(),
      tick,
      location: { ...b.pos, y: 64.5 },
      onGround: false,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69, drag: 0.91 }, false).body;
    if (tick >= 9) {
      expect(out.cut?.length).toBeGreaterThan(0);
      for (const c of out.cut ?? [])
        expect(c.bottom + (c.height ?? 0)).toBe(68);
    }
  }
});

it("starts at its saved blade, raised from 0.5 up, without moving it (ADR 0138)", () =>
  fc.assert(
    fc.property(
      fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
      fc.constantFrom(...FORMS),
      (blade, form) => {
        const d = new BulldozerDrive(0, { blade, form });
        const raised =
          blade === undefined ? S.bladeRaisedOnSpawn : blade >= 0.5;
        expect(d.toolState("blade_switch") === "up").toBe(raised);
        expect(propertyValue(d.step(IDLE, context()).commands, "blade")).toBe(
          raised ? 1 : 0,
        );
      },
    ),
  ));

it("reads a saved blade of exactly 0.5 as raised and a non-number as missing (ADR 0138)", () => {
  expect(
    new BulldozerDrive(0, { blade: 0.5 }).toolState("blade_switch") === "up",
  ).toBe(true);
  expect(
    new BulldozerDrive(0, { blade: 0.4999 }).toolState("blade_switch") === "up",
  ).toBe(false);
  for (const blade of [true, "1"] as unknown as number[])
    expect(
      new BulldozerDrive(0, { blade }).toolState("blade_switch") === "up",
    ).toBe(S.bladeRaisedOnSpawn);
});

const switchSchedule = fc.array(fc.option(fc.boolean(), { nil: undefined }), {
  maxLength: 40,
});

it("moves the blade one step per tick toward the switched state and sends each height once (ADR 0138)", () =>
  fc.assert(
    fc.property(fc.boolean(), switchSchedule, (start, switches) => {
      const d = new BulldozerDrive(0, { blade: start ? 1 : 0 });
      let target = start;
      let steps = start ? S.bladeLiftTicks : 0;
      let sent: number | undefined;
      switches.forEach((set, tick) => {
        if (set !== undefined) {
          d.setToolState("blade_switch", set ? "up" : "down");
          target = set;
        }
        steps += Math.sign((target ? S.bladeLiftTicks : 0) - steps);
        const value = propertyValue(
          d.step(IDLE, { ...context(), tick }).commands,
          "blade",
        );
        const height = steps / S.bladeLiftTicks;
        if (tick === 0 || height !== sent) {
          expect(value).toBe(height);
          sent = height;
        } else expect(value).toBeUndefined();
        expect(d.toolState("blade_switch") === "up").toBe(target);
      });
    }),
  ));

// The ground and flight contexts of the cut tests above.
function cutContext(form: string, tick: number, b: Body): TickContext {
  const ground = form === "car";
  return {
    ...context(),
    tick,
    location: { ...b.pos, y: ground ? 64 : 64.5 },
    onGround: ground,
    ...(ground ? {} : { solidAt: () => false }),
    velocity: { ...b.vel, y: 0 },
  };
}

it.each([false, true])(
  "cuts only with the blade fully lowered, in every form (wide=%s)",
  (wide) =>
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMS),
        fc.boolean(),
        switchSchedule,
        (form, start, switches) => {
          const d = new BulldozerDrive(0, {
            form,
            blade: start ? 1 : 0,
            wide_blade: wide,
          });
          let target = start;
          let steps = start ? S.bladeLiftTicks : 0;
          let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
          switches.forEach((set, tick) => {
            if (set !== undefined) {
              d.setToolState("blade_switch", set ? "up" : "down");
              target = set;
            }
            steps += Math.sign((target ? S.bladeLiftTicks : 0) - steps);
            const ctx = cutContext(form, tick, b);
            const out = d.step(FORWARD, ctx);
            b = engineStep(
              b,
              out.impulse,
              { mu: 0.69, drag: ctx.onGround ? 0.69 : 0.91 },
              ctx.onGround,
            ).body;
            if (target || steps > 0) expect(out.cut).toBeUndefined();
          });
        },
      ),
    ),
);

it("starts cutting on the tick the lowering blade reaches the bottom (ADR 0138)", () => {
  const d = new BulldozerDrive(0, { blade: 1 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 20 + S.bladeLiftTicks; tick++) {
    if (tick === 20) d.setToolState("blade_switch", "down");
    const ctx = cutContext("car", tick, b);
    const out = d.step(FORWARD, ctx);
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    if (tick < 20 + S.bladeLiftTicks - 1) expect(out.cut).toBeUndefined();
    else
      expect(out.cut).toEqual(
        bladeColumns(ctx.location, d.yaw, S.blade, false),
      );
  }
});

function impulsesAgainstStep(d: BulldozerDrive, top: number): number[] {
  const ys: number[] = [];
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 0; tick < 30; tick++) {
    const out = d.step(FORWARD, {
      ...context(),
      tick,
      solidAt: (o) => o.y < top,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    ys.push(out.impulse.y);
  }
  return ys;
}

it("climbs one- and two-block steps with the blade raised, like the SUV (ADR 0138)", () => {
  expect(impulsesAgainstStep(new BulldozerDrive(0, { blade: 1 }), 1)).toContain(
    MOTION.oneStepVelocity,
  );
  expect(impulsesAgainstStep(new BulldozerDrive(0, { blade: 1 }), 2)).toContain(
    MOTION.stepVelocity,
  );
});

it("rises from the submarine step probe with the blade raised (ADR 0138)", () => {
  const a = new BulldozerDrive(0, { form: "submarine", blade: 1 }),
    b = new BulldozerDrive(0, { form: "submarine", blade: 1 });
  expect(
    a.step(FORWARD, { ...context(3), solidAt: (o) => o.y < 1 }).impulse.y,
  ).toBeGreaterThan(
    b.step(FORWARD, { ...context(3), solidAt: (o) => o.y < -1 }).impulse.y,
  );
});

it("switches step-up on the tick the blade's target changes (ADR 0138)", () => {
  const d = new BulldozerDrive(0, { blade: 0 });
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const rises: boolean[] = [];
  for (let tick = 0; tick < 60; tick++) {
    if (tick === 10) d.setToolState("blade_switch", "up");
    if (tick === 40) d.setToolState("blade_switch", "down");
    const out = d.step(FORWARD, {
      ...context(),
      tick,
      solidAt: (o) => o.y < 1,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    rises.push(out.impulse.y > 0);
  }
  expect(rises.indexOf(true)).toBe(10);
  expect(rises.slice(40)).not.toContain(true);
});

it("a placed bulldozer starts raised: it steps up and never cuts", () => {
  fc.assert(
    fc.property(yaw, (heading) => {
      const d = new BulldozerDrive(heading, {});
      expect(d.toolState("blade_switch") === "up").toBe(true);
      let rises = false;
      let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
      for (let tick = 0; tick < 30; tick++) {
        const out = d.step(FORWARD, {
          ...context(),
          tick,
          solidAt: (o) => o.y < 1,
          velocity: { ...b.vel, y: 0 },
        });
        b = engineStep(b, out.impulse, { mu: 0.69 }).body;
        expect(out.cut).toBeUndefined();
        rises ||= out.impulse.y === MOTION.oneStepVelocity;
      }
      expect(rises).toBe(true);
    }),
  );
});
it("restores a saved lowered blade", () => {
  const d = new BulldozerDrive(0, { blade: 0 });
  expect(d.toolState("blade_switch") === "up").toBe(false);
  let out = d.step(FORWARD, context());
  for (let tick = 1; tick < 30 && d.speed <= S.blade.minSpeed; tick++)
    out = d.step(FORWARD, { ...context(), tick });
  expect(d.speed).toBeGreaterThan(S.blade.minSpeed);
  expect(out.cut).toBeDefined();
});
it("restores the wide blade flag, defaulting to normal", () => {
  for (const [saved, shown] of [
    [true, "wide"],
    [false, "normal"],
    [undefined, "normal"],
  ] as const)
    expect(
      new BulldozerDrive(0, { wide_blade: saved }).toolState(
        "wide_blade_switch",
      ),
    ).toBe(shown);
});
it("sends wide_blade once per toggle, and again after resync", () => {
  const d = new BulldozerDrive(0, {});
  const sent = (tick: number) =>
    d
      .step(IDLE, { ...context(), tick })
      .commands.filter((c) => c.name === "wide_blade")
      .map((c) => (c.type === "setProperty" ? c.value : undefined));
  expect(sent(0)).toEqual([false]);
  expect(sent(1)).toEqual([]);
  d.setToolState("wide_blade_switch", "wide");
  expect(sent(2)).toEqual([true]);
  expect(sent(3)).toEqual([]);
  d.resync();
  expect(sent(4)).toEqual([true]);
  d.setToolState("wide_blade_switch", "normal");
  expect(sent(5)).toEqual([false]);
});

it("keeps the blade, wide blade, and road paver tools independent", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.tuple(
            fc.constant(BLADE_SWITCH_ITEM),
            fc.constantFrom("down", "up"),
          ),
          fc.tuple(
            fc.constant(ROAD_PAVER_SWITCH_ITEM),
            fc.constantFrom("off", "on"),
          ),
          fc.tuple(
            fc.constant(WIDE_BLADE_SWITCH_ITEM),
            fc.constantFrom("normal", "wide"),
          ),
        ),
      ),
      (sets) => {
        const drive = new BulldozerDrive(0, {});
        const last = new Map([
          [BLADE_SWITCH_ITEM, drive.toolState(BLADE_SWITCH_ITEM)],
          [WIDE_BLADE_SWITCH_ITEM, drive.toolState(WIDE_BLADE_SWITCH_ITEM)],
          [ROAD_PAVER_SWITCH_ITEM, drive.toolState(ROAD_PAVER_SWITCH_ITEM)],
        ]);
        for (const [item, state] of sets) {
          expect(drive.setToolState(item, state)).toBe(true);
          last.set(item, state);
        }
        for (const [item, state] of last)
          expect(drive.toolState(item)).toBe(state);
      },
    ),
  );
});
it("restores the road paver flag, defaulting to off", () => {
  for (const [saved, shown] of [
    [true, "on"],
    [false, "off"],
    [undefined, "off"],
  ] as const)
    expect(
      new BulldozerDrive(0, { road_paver: saved }).toolState(
        "road_paver_switch",
      ),
    ).toBe(shown);
});
it("sends road_paver once per toggle, and again after resync", () => {
  const d = new BulldozerDrive(0, {});
  const sent = (tick: number) =>
    d
      .step(IDLE, { ...context(), tick })
      .commands.filter((c) => c.name === "road_paver")
      .map((c) => (c.type === "setProperty" ? c.value : undefined));
  expect(sent(0)).toEqual([false]);
  expect(sent(1)).toEqual([]);
  d.setToolState("road_paver_switch", "on");
  expect(sent(2)).toEqual([true]);
  expect(sent(3)).toEqual([]);
  d.resync();
  expect(sent(4)).toEqual([true]);
  d.setToolState("road_paver_switch", "off");
  expect(sent(5)).toEqual([false]);
});

it("uses the current blade rule for cuts and ram width across toggles", () => {
  fc.assert(
    fc.property(
      yaw,
      fc.array(fc.boolean(), { minLength: 20, maxLength: 40 }),
      fc.boolean(),
      (heading, widths, raised) => {
        const d = new BulldozerDrive(heading, { blade: raised ? 1 : 0 });
        let b: Body = { pos: { x: 0.5, z: 0.5 }, vel: { x: 0, z: 0 } };
        widths.forEach((wide, tick) => {
          d.setToolState(WIDE_BLADE_SWITCH_ITEM, wide ? "wide" : "normal");
          const rule = wide ? BULLDOZER_WIDE_BLADE : S.blade;
          const ctx = cutContext("car", tick, b);
          const out = d.step(FORWARD, ctx);
          expect(out.ramHalfWidth).toBe(rule.halfWidth);
          expect(out.ramHalfWidth).toBeLessThanOrEqual(
            ramHalfWidthLimit(BULLDOZER_PROFILE),
          );
          if (raised || d.speed <= rule.minSpeed)
            expect(out.cut).toBeUndefined();
          else
            expect(out.cut).toEqual(
              bladeColumns(ctx.location, d.yaw, rule, false),
            );
          b = engineStep(b, out.impulse, { mu: 0.69 }).body;
        });
      },
    ),
  );
});
it("reports the original body ram width with the normal blade", () => {
  for (const blade of [0, 1])
    expect(
      new BulldozerDrive(0, { blade }).step(FORWARD, context()).ramHalfWidth,
    ).toBe(BULLDOZER_PROFILE.body.halfWidth);
});
