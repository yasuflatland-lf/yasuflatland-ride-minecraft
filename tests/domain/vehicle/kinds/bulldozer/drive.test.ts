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
import { paveStep } from "../../../../../src/domain/vehicle/kinds/bulldozer/paver";
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
          waterDepth: 0,
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
    waterDepth: 0,
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
        waterDepth: 0,
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
it("cuts a full body tunnel at speed during flight and after a restart (ADRs 0137, 0155)", () => {
  fc.assert(
    fc.property(yaw, (heading) => {
      for (const start of ["car", "takeoff", "hover", "landing"] as const) {
        const d = new BulldozerDrive(heading, { form: start, blade: 0 });
        let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        const seen = new Set<string>();
        for (let tick = 0; tick < 100; tick++) {
          const jump = start === "car" && [50, 54, 80, 84].includes(tick);
          const onGround = start === "car" && tick <= 50;
          const ctx = {
            ...context(),
            tick,
            location: { ...body.pos, y: 64.5 },
            onGround,
            solidAt: () => false,
            velocity: { ...body.vel, y: 0 },
          };
          const out = d.step({ ...FORWARD, jump }, ctx);
          body = engineStep(
            body,
            out.impulse,
            { mu: 0.69, drag: onGround ? 0.69 : 0.91 },
            onGround,
          ).body;
          if (d.form === "car" || d.speed <= S.blade.minSpeed) continue;
          seen.add(d.form);
          expect(out.cut?.length).toBeGreaterThan(0);
          for (const column of out.cut ?? []) {
            expect(column.bottom).toBe(64);
            expect(column.bottom + (column.height ?? 0)).toBe(68);
          }
        }
        // A restored takeoff has no carried speed and accelerates once it reaches hover.
        const expected =
          start === "car"
            ? ["hover", "landing", "takeoff"]
            : [start === "takeoff" ? "hover" : start];
        expect([...seen].sort()).toEqual(expected);
      }
    }),
  );
});

it("cuts at speed with a fully lowered blade, a driver, and no pivot, including on the grounded hop tick", () => {
  const control = {
    forward: FORWARD,
    reverse: { ...IDLE, moveY: -1 },
    idle: IDLE,
    pivot: { ...IDLE, moveX: 1 },
    absent: undefined,
    ledge: FORWARD,
    hop: { ...FORWARD, jump: true },
  } satisfies Record<string, RawInput | undefined>;
  type Action = keyof typeof control;
  type Frame = { action: Action; blade?: "up" | "down" };
  fc.assert(
    fc.property(
      yaw,
      fc.integer({ min: 12, max: 30 }),
      fc.array(
        fc.record({
          action: fc.constantFrom<Action>(
            "forward",
            "reverse",
            "idle",
            "pivot",
            "absent",
            "ledge",
          ),
          blade: fc.constantFrom("up", "down", undefined),
        }),
        { maxLength: 30 },
      ),
      (heading, warmup, schedule) => {
        for (const form of ["car", "submarine"] as const) {
          const d = new BulldozerDrive(heading, { form, blade: 0 });
          const underwater = form === "submarine";
          let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
          let bladeHeight = 0;
          let bladeUp = false;
          const controls: Frame[] = [
            { action: "idle" },
            { action: "reverse" },
            ...Array.from(
              { length: warmup },
              (): Frame => ({ action: "forward" }),
            ),
            { action: underwater ? "forward" : "hop" },
            { action: "ledge" },
            { action: "pivot" },
            { action: "absent" },
            { action: "forward", blade: "up" },
            ...Array.from(
              { length: S.bladeLiftTicks },
              (): Frame => ({
                action: "forward",
              }),
            ),
            { action: "forward", blade: "down" },
            ...Array.from(
              { length: S.bladeLiftTicks },
              (): Frame => ({
                action: "forward",
              }),
            ),
            ...schedule,
          ];
          let cutForward = false;
          for (const [tick, frame] of controls.entries()) {
            if (frame.blade !== undefined) {
              d.setToolState("blade_switch", frame.blade);
              bladeUp = frame.blade === "up";
            }
            bladeHeight += Math.sign(
              (bladeUp ? S.bladeLiftTicks : 0) - bladeHeight,
            );
            const onGround = !underwater && frame.action !== "ledge";
            const ctx = {
              ...context(underwater ? 3 : 0),
              tick,
              location: { ...body.pos, y: 64 },
              onGround,
              velocity: { ...body.vel, y: 0 },
            };
            const raw = control[frame.action];
            const out = d.step(raw, ctx);
            body = engineStep(
              body,
              out.impulse,
              { mu: 0.69, drag: underwater ? 0.83 : 0.69 },
              onGround,
            ).body;
            expect(d.form).toBe(form);
            const shouldCut =
              raw !== undefined &&
              frame.action !== "pivot" &&
              d.speed > S.blade.minSpeed &&
              !bladeUp &&
              bladeHeight === 0 &&
              (underwater || onGround);
            const reach = underwater
              ? ({ kind: "fixed", grounded: false } as const)
              : ({ kind: "run" } as const);
            expect(out.cut ?? []).toEqual(
              shouldCut
                ? bladeColumns(ctx.location, d.yaw, S.blade, reach)
                : [],
            );
            if (frame.action === "forward" && shouldCut) cutForward = true;
            if (frame.action === "hop") {
              expect(out.impulse.y).toBeGreaterThan(0);
              expect(out.cut?.length).toBeGreaterThan(0);
            }
          }
          expect(cutForward).toBe(true);
        }
      },
    ),
  );
});

it("maps forms to the cut reach", () => {
  expect(cutReach("car", true)).toEqual({ kind: "run" });
  expect(cutReach("car", false)).toBeUndefined();
  for (const f of FORMS.filter((form) => form !== "car"))
    for (const ground of [true, false])
      expect(cutReach(f, ground)).toEqual({ kind: "fixed", grounded: ground });
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
      bladeColumns(ctx.location, d.yaw, S.blade, {
        kind: "fixed",
        grounded: false,
      }),
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
      (form, centered, fx, fy, fz, i, k, dy) => {
        const location = { x: 10 + fx, y: 40 + fy, z: -3 + fz };
        const top = Math.floor(location.y + S.carHeight);
        const xs = cellsAcross(location.x, wide);
        const zs = cellsAcross(location.z, wide);
        const roof = {
          x: centered ? Math.floor(location.x) : (xs[i % xs.length] ?? 0),
          y: top + dy,
          z: centered ? Math.floor(location.z) : (zs[k % zs.length] ?? 0),
        };
        const ctx = {
          ...context(form === "submarine" ? 3 : 0),
          onGround: false,
          location,
          solidAt: (o: { x: number; y: number; z: number }) =>
            Math.floor(location.x + o.x) === roof.x &&
            Math.floor(location.y + o.y) === roof.y &&
            Math.floor(location.z + o.z) === roof.z,
        };
        const overFootprint =
          cellsAcross(location.x, S.footprint / 2).includes(roof.x) &&
          cellsAcross(location.z, S.footprint / 2).includes(roof.z) &&
          dy >= 0 &&
          dy < S.shaft.reach;
        const shaft = xs.flatMap((x) =>
          zs.map((z) => ({ x, z, bottom: top, height: S.shaft.reach })),
        );
        const key = (c: { x: number; z: number }) => `${c.x},${c.z}`;
        const byCell = (
          a: { x: number; z: number },
          b: { x: number; z: number },
        ) => key(a).localeCompare(key(b));
        const scenarios = [
          { blade: 0, raw: { ...IDLE, jump: true }, rising: true },
          { blade: 0, raw: IDLE, rising: form === "takeoff" },
          { blade: 1, raw: { ...IDLE, jump: true }, rising: true },
          { blade: 0, raw: undefined, rising: form === "takeoff" },
        ];
        for (const { blade, raw, rising } of scenarios) {
          const d = new BulldozerDrive(0, { form, blade });
          const { cut } = d.step(raw, ctx);
          const expected =
            blade === 0 && raw !== undefined && rising && overFootprint
              ? shaft
              : [];
          expect([...(cut ?? [])].sort(byCell)).toEqual(
            [...expected].sort(byCell),
          );
        }
      },
    ),
  );
});
it("sends track spin and phase from the travel on a pivot", () => {
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
function propertyUpdates() {
  const last = new Map<string, unknown>();
  return {
    forValue(name: string, value: unknown) {
      const changed = !last.has(name) || !Object.is(last.get(name), value);
      last.set(name, value);
      return changed ? [{ type: "setProperty", name, value }] : [];
    },
    resync: () => last.clear(),
  };
}

it("sends each track value only when it changes, and all again after resync", () => {
  const d = new BulldozerDrive(0, {});
  let b: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const updates = propertyUpdates();
  let onlyRight = false;
  for (let tick = 0; tick < 200; tick++) {
    const raw =
      tick % 37 < 3
        ? { ...IDLE, moveX: 0.371 }
        : tick % 37 < 9
          ? { ...IDLE, moveY: 0.11 }
          : IDLE;
    const out = d.step(raw, {
      ...context(),
      tick,
      velocity: { ...b.vel, y: 0 },
    });
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    const tracks = out.commands.filter((c) => /^(track|spin)_/.test(c.name));
    for (const c of tracks)
      if (c.type === "setProperty")
        expect(updates.forValue(c.name, c.value)).toEqual([c]);
    if (tracks.length === 1 && tracks[0]?.name === "spin_r") onlyRight = true;
  }
  expect(onlyRight).toBe(true);
  updates.resync();
  d.resync();
  const out = d.step(IDLE, context());
  for (const name of ["door", "track_r", "track_l", "spin_r", "spin_l"]) {
    const value = propertyValue(out.commands, name);
    expect(value).toBeDefined();
    expect(out.commands.filter((c) => c.name === name)).toEqual(
      updates.forValue(name, value),
    );
  }
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

it("starts at its saved blade, raised from 0.5 up, without moving it (ADR 0138)", () =>
  fc.assert(
    fc.property(
      fc.option(
        fc.oneof(
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.constant(0.4999),
          fc.constantFrom(true, false, "1", "0"),
        ),
        { nil: undefined },
      ),
      fc.constantFrom(...FORMS),
      (blade, form) => {
        const d = new BulldozerDrive(0, { blade, form });
        const raised =
          typeof blade === "number" ? blade >= 0.5 : S.bladeRaisedOnSpawn;
        expect(d.toolState("blade_switch") === "up").toBe(raised);
        expect(propertyValue(d.step(IDLE, context()).commands, "blade")).toBe(
          raised ? 1 : 0,
        );
      },
    ),
  ));

it("reads a saved blade of exactly 0.5 as raised (ADR 0138)", () => {
  expect(
    new BulldozerDrive(0, { blade: 0.5 }).toolState("blade_switch") === "up",
  ).toBe(true);
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

it("steps up in car and submarine form only with a raised blade (ADR 0138)", () => {
  fc.assert(
    fc.property(yaw, fc.constantFrom(1, 2), (heading, height) => {
      for (const blade of [0, 1, undefined]) {
        const raised = blade !== 0;
        const car = new BulldozerDrive(heading, { blade });
        let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        const impulses: number[] = [];
        for (let tick = 0; tick < 30; tick++) {
          const out = car.step(FORWARD, {
            ...context(),
            tick,
            solidAt: (o) => o.y < height,
            velocity: { ...body.vel, y: 0 },
          });
          body = engineStep(body, out.impulse, { mu: 0.69 }).body;
          impulses.push(out.impulse.y);
          if (blade === undefined) expect(out.cut).toBeUndefined();
        }
        if (raised)
          expect(impulses).toContain(
            height === 1 ? MOTION.oneStepVelocity : MOTION.stepVelocity,
          );
        else expect(impulses.every((impulse) => impulse === 0)).toBe(true);

        const impulseAt = (top: number) =>
          new BulldozerDrive(heading, { form: "submarine", blade }).step(
            FORWARD,
            { ...context(3), solidAt: (o) => o.y < top },
          ).impulse.y;
        const baseline = impulseAt(-1);
        if (raised) expect(impulseAt(height)).toBeGreaterThan(baseline);
        else expect(impulseAt(height)).toBe(baseline);
      }
    }),
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

const toggles = fc.constantFrom(
  {
    property: "wide_blade",
    item: WIDE_BLADE_SWITCH_ITEM,
    off: "normal",
    on: "wide",
  },
  {
    property: "road_paver",
    item: ROAD_PAVER_SWITCH_ITEM,
    off: "off",
    on: "on",
  },
);

it("restores either tool flag, defaulting to its off state", () => {
  fc.assert(
    fc.property(
      toggles,
      fc.option(fc.boolean(), { nil: undefined }),
      ({ property, item, off, on }, saved) => {
        expect(
          new BulldozerDrive(0, { [property]: saved }).toolState(item),
        ).toBe(saved ? on : off);
      },
    ),
  );
});

it("sends tool flags only when changed or resynced", () => {
  fc.assert(
    fc.property(
      toggles,
      fc.array(fc.constantFrom("idle", "toggle", "resync"), {
        minLength: 1,
        maxLength: 60,
      }),
      ({ property, item, off, on }, steps) => {
        const drive = new BulldozerDrive(0, {});
        const updates = propertyUpdates();
        let enabled = false;
        for (const [tick, action] of steps.entries()) {
          if (action === "toggle") {
            enabled = !enabled;
            expect(drive.setToolState(item, enabled ? on : off)).toBe(true);
          }
          if (action === "resync") {
            drive.resync();
            updates.resync();
          }
          expect(
            drive
              .step(IDLE, { ...context(), tick })
              .commands.filter((c) => c.name === property),
          ).toEqual(updates.forValue(property, enabled));
        }
      },
    ),
  );
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
              bladeColumns(ctx.location, d.yaw, rule, { kind: "run" }),
            );
          b = engineStep(b, out.impulse, { mu: 0.69 }).body;
        });
      },
    ),
  );
});

function paveContext(form: string, tick: number, b: Body): TickContext {
  return {
    ...cutContext(form, tick, b),
    heldBlock: "minecraft:oak_planks",
    waterAt: () => false,
  };
}
function expectedPave(d: BulldozerDrive, ctx: TickContext, wide: boolean) {
  return paveStep(
    {
      location: ctx.location ?? { x: 0, y: 0, z: 0 },
      yaw: d.yaw,
      speed: d.speed,
      form: d.form,
      onGround: ctx.onGround,
      halfWidth: (wide ? BULLDOZER_WIDE_BLADE : S.blade).halfWidth,
      block: ctx.heldBlock,
    },
    (cell) => {
      const o = {
        x: cell.x + 0.5 - (ctx.location?.x ?? 0),
        y: cell.y + 0.5 - (ctx.location?.y ?? 0),
        z: cell.z + 0.5 - (ctx.location?.z ?? 0),
      };
      if (ctx.solidAt(o)) return "solid";
      if (ctx.waterAt(o)) return "liquid";
      return "open";
    },
  );
}

it.each([false, true])(
  "lays exactly the paver's road at the blade's width, and only with the switch on and input (wide=%s)",
  (wide) =>
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMS),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (form, paverOn, raised, hasInput) => {
          const d = new BulldozerDrive(0, {
            form,
            blade: raised ? 1 : 0,
            wide_blade: wide,
            road_paver: paverOn,
          });
          let b: Body = { pos: { x: 0.5, z: 0.5 }, vel: { x: 0, z: 0 } };
          for (let tick = 0; tick < 30; tick++) {
            const ctx = paveContext(form, tick, b);
            const out = d.step(hasInput ? FORWARD : undefined, ctx);
            if (!paverOn || !hasInput) expect(out.pave).toBeUndefined();
            else expect(out.pave).toEqual(expectedPave(d, ctx, wide));
            b = engineStep(b, out.impulse, { mu: 0.69 }).body;
          }
        },
      ),
    ),
);
it("paves the same with the blade raised or lowered, at the wide width", () => {
  for (const wide of [false, true]) {
    const run = (blade: number) => {
      const d = new BulldozerDrive(0, {
        form: "car",
        blade,
        wide_blade: wide,
        road_paver: true,
      });
      let b: Body = { pos: { x: 0.5, z: 0.5 }, vel: { x: 0, z: 0 } };
      const laid: unknown[] = [];
      for (let tick = 0; tick < 40; tick++) {
        const out = d.step(FORWARD, paveContext("car", tick, b));
        laid.push(out.pave);
        b = engineStep(b, out.impulse, { mu: 0.69 }).body;
      }
      return laid;
    };
    expect(run(1)).toEqual(run(0));
    expect(run(0).some((p) => p !== undefined)).toBe(true);
  }
});
it("lays nothing with no held block or off the ground", () => {
  function expectNoPave(override: Partial<TickContext>): void {
    const d = new BulldozerDrive(0, { form: "car", road_paver: true });
    let b: Body = { pos: { x: 0.5, z: 0.5 }, vel: { x: 0, z: 0 } };
    for (let tick = 0; tick < 20; tick++) {
      const out = d.step(FORWARD, {
        ...paveContext("car", tick, b),
        ...override,
      });
      expect(out.pave).toBeUndefined();
      b = engineStep(b, out.impulse, { mu: 0.69 }).body;
    }
  }
  expectNoPave({ heldBlock: undefined });
  expectNoPave({ onGround: false });
});

// Support cells ahead of the body exist only where the reference row is liquid (ADR 0181 rule 6).
function supportAhead(overrides: Partial<TickContext>): number {
  const d = new BulldozerDrive(0, { form: "car", road_paver: true });
  const start = { x: 0.5, z: 0.5 };
  let b: Body = { pos: start, vel: { x: 0, z: 0 } };
  let ahead = 0;
  for (let tick = 0; tick < 40; tick++) {
    const ctx = { ...paveContext("car", tick, b), ...overrides };
    const out = d.step(FORWARD, ctx);
    const dx = b.pos.x - start.x;
    const dz = b.pos.z - start.z;
    const len = Math.hypot(dx, dz);
    if (tick > 10 && len > 1e-6 && out.pave !== undefined)
      for (const cell of out.pave.cells) {
        const along =
          ((cell.x + 0.5 - b.pos.x) * dx + (cell.z + 0.5 - b.pos.z) * dz) / len;
        if (along > S.paver.bodyHalf) ahead++;
      }
    b = engineStep(b, out.impulse, { mu: 0.69 }).body;
  }
  return ahead;
}

it("bridges a lava or water reference row with support ahead of the body", () => {
  const sunk = { solidAt: (o: { y: number }) => o.y < -1 };
  const inRow = (o: { y: number }) => o.y >= -1 && o.y < 0;
  expect(supportAhead({ ...sunk, lavaAt: inRow })).toBeGreaterThan(0);
  expect(supportAhead({ ...sunk, waterAt: inRow })).toBeGreaterThan(0);
  expect(supportAhead(sunk)).toBe(0);
});

it("treats a waterlogged solid block as solid, so it needs no support", () => {
  expect(
    supportAhead({ waterAt: (o) => o.y >= -1 && o.y < 0, lavaAt: () => false }),
  ).toBe(0);
});
