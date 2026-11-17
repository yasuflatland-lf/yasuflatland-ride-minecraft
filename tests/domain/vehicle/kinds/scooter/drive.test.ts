import fc from "fast-check";
import { expect, it } from "vitest";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { ScooterDrive } from "../../../../../src/domain/vehicle/kinds/scooter/drive";
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
          if (drive.form !== "car" || drive.speed === 0)
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
it("leans and steers into a ground turn, then eases upright in flight", () => {
  const drive = new ScooterDrive(0, {});
  for (let tick = 0; tick < 30; tick++)
    drive.step(
      { ...idle, moveX: 1, moveY: 1 },
      { ...context(), tick, velocity: { x: 0, y: 0, z: drive.speed } },
    );
  expect(drive.yaw).toBeLessThan(0);
  expect(drive.inspect().lean).toBeGreaterThan(0);
  expect(drive.inspect().steer).toBe(SCOOTER_SPEC.maxSteer);
  drive.step({ ...idle, jump: true }, { ...context(), tick: 30 });
  drive.step(idle, { ...context(), tick: 31 });
  drive.step({ ...idle, jump: true }, { ...context(), tick: 32 });
  expect(drive.form).toBe("takeoff");
  expect(drive.inspect().stand).toBe(false);
  for (
    let tick = 33;
    tick <= 33 + SCOOTER_SPEC.maxLean / SCOOTER_SPEC.leanRate;
    tick++
  )
    drive.step(idle, { ...context(), tick });
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
            expect(out.riderLean).toBe(steer * SCOOTER_SPEC.leanLevels);
        }
      },
    ),
  );
});
