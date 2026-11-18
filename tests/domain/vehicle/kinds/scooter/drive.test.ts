import fc from "fast-check";
import { expect, it } from "vitest";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { ScooterDrive } from "../../../../../src/domain/vehicle/kinds/scooter/drive";
import { rollLevel } from "../../../../../src/domain/vehicle/kinds/scooter/lean";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";
import { FORMS } from "../../../../../src/domain/vehicle/motion/forms";
import { engineStep } from "../../../../support/engineModel";
import { waterSensors } from "../../../../support/waterDepth";

const idle: RawInput = { moveX: 0, moveY: 0, jump: false };
function context(depth = 0): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(depth),
    solidAt: () => false,
    blockTypes: () => [],
  };
}
const axis = fc.double({ min: -1, max: 1, noNaN: true });
const samples = fc.array(
  fc.record({
    raw: fc.option(
      fc.record({ moveX: axis, moveY: axis, jump: fc.boolean() }),
      { nil: undefined },
    ),
    depth: fc.integer({ min: 0, max: 600 }).map((n) => n / 100),
    onGround: fc.boolean(),
    awaitingDriver: fc.boolean(),
    velocity: fc.record({ x: axis, y: axis, z: axis }),
  }),
  { minLength: 1, maxLength: 80 },
);

it("never dives and sends visual properties only when their values change", () => {
  fc.assert(
    fc.property(samples, fc.constantFrom(...FORMS), (ticks, form) => {
      const drive = new ScooterDrive(0, { form });
      const sent = new Map<string, number | boolean>();
      let lean = 0;
      ticks.forEach(
        ({ raw, depth, onGround, awaitingDriver, velocity }, tick) => {
          const out = drive.step(raw, {
            ...context(depth),
            tick,
            onGround,
            awaitingDriver,
            velocity,
          });
          expect(drive.form).not.toBe("submarine");
          const state = drive.inspect();
          for (const [name, value] of [
            ["lean", state.lean],
            ["steer", state.steer],
            ["stand", state.stand],
          ] as const) {
            const commands = out.commands.filter(
              (c) => c.type === "setProperty" && c.name === name,
            );
            expect(commands).toEqual(
              sent.get(name) === value
                ? []
                : [{ type: "setProperty", name, value }],
            );
            sent.set(name, value);
          }
          if (
            raw !== undefined ||
            awaitingDriver ||
            depth > 0 ||
            drive.form !== "car"
          )
            expect(state.stand).toBe(false);
          expect(Math.abs(state.lean)).toBeLessThanOrEqual(
            SCOOTER_SPEC.maxLean,
          );
          expect(Math.abs(state.lean - lean)).toBeLessThanOrEqual(
            SCOOTER_SPEC.leanRate + 1e-12,
          );
          if (
            drive.form === "takeoff" ||
            raw === undefined ||
            drive.speed === 0
          )
            expect(Math.abs(state.lean)).toBeLessThanOrEqual(Math.abs(lean));
          lean = state.lean;
        },
      );
    }),
  );
});
it("lowers the stand once at rest and raises it when a driver appears", () => {
  const drive = new ScooterDrive(0, {});
  const first = drive.step(undefined, context());
  const second = drive.step(undefined, { ...context(), tick: 1 });
  expect(first.commands).toContainEqual({
    type: "setProperty",
    name: "stand",
    value: true,
  });
  expect(
    second.commands.filter((c) => ["lean", "steer", "stand"].includes(c.name)),
  ).toEqual([]);
  expect(drive.step(idle, { ...context(), tick: 2 }).commands).toContainEqual({
    type: "setProperty",
    name: "stand",
    value: false,
  });
});
it("resends both inherited and scooter properties after resync", () => {
  const drive = new ScooterDrive(0, {});
  drive.step(undefined, context());
  drive.resync();
  const out = drive.step(undefined, context());
  for (const name of ["form", "bank", "gear_down", "lean", "steer", "stand"])
    expect(
      out.commands.some((c) => c.type === "setProperty" && c.name === name),
    ).toBe(true);
});
it("leans into hover and landing turns with the ground sign", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("hover", "landing"),
      fc.constantFrom(-1, 1),
      (form, steer) => {
        for (const initialForm of ["car", form] as const) {
          const drive = new ScooterDrive(0, { form: initialForm });
          let riderLean = 0;
          let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
          for (let tick = 0; tick < 30; tick++) {
            const out = drive.step(
              { ...idle, moveX: steer, moveY: 1 },
              {
                ...context(),
                tick,
                onGround: initialForm === "car",
                velocity: { ...body.vel, y: 0 },
              },
            );
            body = engineStep(
              body,
              out.impulse,
              { mu: 0.688 },
              initialForm === "car",
            ).body;
            riderLean = out.riderLean ?? 0;
          }
          expect(drive.form).toBe(initialForm);
          expect(Math.sign(drive.yaw)).toBe(-steer);
          expect(Math.sign(drive.inspect().lean)).toBe(steer);
          if (initialForm !== "car") {
            expect(drive.inspect().lean).toBe(steer * SCOOTER_SPEC.maxLean);
            const { lean, bank } = drive.inspect();
            expect(riderLean).toBe(
              rollLevel(lean - bank, SCOOTER_SPEC.rollLevelAngles),
            );
            expect(Math.sign(riderLean)).toBe(steer);
            // Bank adds to lean in flight turns, so the rider follows the whole body roll.
            if (form === "hover")
              expect(Math.abs(lean - bank)).toBeGreaterThan(Math.abs(lean));
            else expect(bank).toBe(0);
          }
          expect(drive.inspect().steer).toBe(steer * SCOOTER_SPEC.maxSteer);
        }
      },
    ),
  );
});
it("bounds flight lean by maxLean and each tick's change by leanRate", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("hover", "landing"),
      fc.array(axis, { minLength: 20, maxLength: 80 }),
      (form, turns) => {
        const drive = new ScooterDrive(0, { form });
        let previous = 0;
        let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        turns.forEach((moveX, tick) => {
          const out = drive.step(
            { ...idle, moveX, moveY: 1 },
            {
              ...context(),
              tick,
              onGround: false,
              velocity: { ...body.vel, y: 0 },
            },
          );
          body = engineStep(body, out.impulse, { mu: 0.688 }, false).body;
          expect(drive.form).toBe(form);
          const lean = drive.inspect().lean;
          expect(Math.abs(lean)).toBeLessThanOrEqual(SCOOTER_SPEC.maxLean);
          expect(Math.abs(lean - previous)).toBeLessThanOrEqual(
            SCOOTER_SPEC.leanRate + 1e-12,
          );
          previous = lean;
        });
      },
    ),
  );
});
it("eases flight lean upright when steering is released or the driver leaves", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("hover", "landing"),
      fc.constantFrom(-1, 1),
      fc.boolean(),
      (form, steer, driverLeaves) => {
        const drive = new ScooterDrive(0, { form });
        let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        for (let tick = 0; tick < 60; tick++) {
          const out = drive.step(
            { ...idle, moveX: steer, moveY: 1 },
            {
              ...context(),
              tick,
              onGround: false,
              velocity: { ...body.vel, y: 0 },
            },
          );
          body = engineStep(body, out.impulse, { mu: 0.688 }, false).body;
        }
        expect(drive.inspect().lean).toBe(steer * SCOOTER_SPEC.maxLean);
        let riderLean = 0;
        for (
          let tick = 0;
          tick < SCOOTER_SPEC.maxLean / SCOOTER_SPEC.leanRate;
          tick++
        ) {
          const previous = drive.inspect().lean;
          const out = drive.step(
            driverLeaves ? undefined : { ...idle, moveY: 1 },
            {
              ...context(),
              tick: 60 + tick,
              onGround: false,
            },
          );
          expect(drive.inspect().lean).toBe(
            previous - steer * SCOOTER_SPEC.leanRate,
          );
          riderLean = out.riderLean ?? 0;
        }
        expect(drive.inspect().lean).toBe(0);
        expect(riderLean).toBe(0);
      },
    ),
  );
});
it("eases upright during take-off even while steering is held", () => {
  const drive = new ScooterDrive(0, {});
  const turn = { ...idle, moveX: 1, moveY: 1 };
  let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const stepGround = (raw: RawInput, tick: number) => {
    const out = drive.step(raw, {
      ...context(),
      tick,
      velocity: { ...body.vel, y: 0 },
    });
    body = engineStep(body, out.impulse, { mu: 0.688 }).body;
  };
  for (let tick = 0; tick < 60; tick++) stepGround(turn, tick);
  stepGround({ ...turn, jump: true }, 60);
  stepGround(turn, 61);
  const previous = drive.inspect().lean;
  expect(previous).toBe(SCOOTER_SPEC.maxLean);
  stepGround({ ...turn, jump: true }, 62);
  expect(drive.form).toBe("takeoff");
  expect(drive.inspect().stand).toBe(false);
  expect(drive.inspect().lean).toBe(previous - SCOOTER_SPEC.leanRate);
  for (
    let tick = 63;
    tick < 63 + SCOOTER_SPEC.maxLean / SCOOTER_SPEC.leanRate;
    tick++
  ) {
    const previous = drive.inspect().lean;
    const out = drive.step(turn, { ...context(), tick, onGround: false });
    expect(drive.form).toBe("takeoff");
    expect(drive.inspect().lean).toBe(
      Math.max(0, previous - SCOOTER_SPEC.leanRate),
    );
    if (drive.inspect().lean === 0) expect(out.riderLean).toBe(0);
  }
  expect(drive.inspect().lean).toBe(0);
});
it("floats level without a driver and corrects depth toward the surface", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 500 }).map((n) => n / 100),
      (depth) => {
        const drive = new ScooterDrive(0, {});
        const out = drive.step(undefined, {
          ...context(depth),
          onGround: false,
        });
        expect(drive.speed).toBe(0);
        expect(drive.inspect()).toMatchObject({
          bank: 0,
          lean: 0,
          steer: 0,
          stand: false,
        });
        if (depth > SCOOTER_SPEC.floatDraft)
          expect(out.impulse.y).toBeGreaterThan(0);
        else if (depth < SCOOTER_SPEC.floatDraft) expect(out.impulse.y).toBe(0);
      },
    ),
  );
});

it("reports upright straight driving and signed rider lean in sustained turns", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(-1, 1),
      fc.integer({ min: 40, max: 100 }),
      (steer, duration) => {
        const drive = new ScooterDrive(0, {});
        let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
        const step = (moveX: number) => {
          const out = drive.step(
            { ...idle, moveX, moveY: 1 },
            { ...context(), velocity: { ...body.vel, y: 0 } },
          );
          body = engineStep(body, out.impulse, { mu: 0.688 }).body;
          return out;
        };
        for (let tick = 0; tick < duration; tick++)
          expect(step(0).riderLean).toBe(0);
        expect(drive.speed).toBeCloseTo(SCOOTER_SPEC.maxSpeed);
        for (let tick = 0; tick < duration; tick++) {
          const out = step(steer);
          if (tick >= SCOOTER_SPEC.maxLean / SCOOTER_SPEC.leanRate)
            expect(out.riderLean).toBe(steer * 3);
        }
      },
    ),
  );
});
