import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward } from "../../../../src/domain/shared/vec";
import type { Dock } from "../../../../src/domain/vehicle/dock/dock";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
import {
  DOCK,
  Hold,
  heldStep,
  pushesStick,
} from "../../../../src/domain/vehicle/motion/dock";

it("reaches the hold threshold after consecutive still ticks", () => {
  const action = fc.record({
    still: fc.boolean(),
    ticks: fc.integer({ min: 1, max: 2 * DOCK.ticks }),
  });
  fc.assert(
    fc.property(fc.array(action), (actions) => {
      const hold = new Hold(false);
      let count = 0;
      for (const action of actions) {
        for (let i = 0; i < action.ticks; i++) {
          count = action.still ? count + 1 : 0;
          expect(hold.observe(action.still)).toBe(count >= DOCK.ticks);
        }
      }
    }),
  );
});

const dock: Dock = {
  hold: { x: 0, y: 64, z: 0, yaw: 0 },
  cells: [],
  seats: [],
};
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const pose = fc.record({
  x: fc.integer(),
  y: fc.integer(),
  z: fc.integer(),
  yaw,
});

describe("Hold", () => {
  it("keeps a restored hold in the step history even if it leaves immediately", () => {
    fc.assert(
      fc.property(
        pose,
        fc.constantFrom("stay", "depart", "reject"),
        (location, recovery) => {
          const hold = new Hold(true);
          expect(hold.restoring).toBe(true);
          expect(hold.held).toBeUndefined();
          hold.resync();
          hold.beginStep();
          expect(hold.wasHeld).toBe(true);

          if (recovery !== "reject") {
            hold.adopt(location);
            expect(hold.held).toBe(location);
          }
          if (recovery !== "stay") {
            expect(hold.leave()).toStrictEqual([
              { type: "triggerEvent", name: "undock" },
              { type: "setProperty", name: "docked", value: false },
            ]);
          }
          expect(hold.restoring).toBe(false);
          expect(hold.resendCommand()).toBeUndefined();

          hold.resync();
          hold.beginStep();
          expect(hold.wasHeld).toBe(recovery === "stay");
          expect(hold.held).toBe(recovery === "stay" ? location : undefined);
          expect(hold.resendCommand()).toStrictEqual({
            type: "setProperty",
            name: "docked",
            value: recovery === "stay",
          });
          hold.beginStep();
          expect(hold.resendCommand()).toBeUndefined();
        },
      ),
    );
  });

  it("sends one docked value per transition or retry across repeated holds", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(pose, fc.boolean()), { minLength: 1 }),
        (holds) => {
          const hold = new Hold(false);
          hold.resync();
          hold.beginStep();
          expect(hold.resendCommand()).toBeUndefined();

          for (const [location, retryWhileHeld] of holds) {
            hold.resync();
            hold.beginStep();
            expect(hold.wasHeld).toBe(false);
            expect(hold.enter(location)).toStrictEqual([
              { type: "triggerEvent", name: "dock" },
              { type: "setProperty", name: "docked", value: true },
            ]);
            expect(hold.held).toBe(location);
            expect(hold.resendCommand()).toBeUndefined();

            hold.resync();
            if (retryWhileHeld) {
              hold.beginStep();
              expect(hold.wasHeld).toBe(true);
              expect(hold.resendCommand()).toStrictEqual({
                type: "setProperty",
                name: "docked",
                value: true,
              });
              hold.beginStep();
              expect(hold.resendCommand()).toBeUndefined();
            }

            hold.beginStep();
            expect(hold.wasHeld).toBe(true);
            expect(hold.leave()).toStrictEqual([
              { type: "triggerEvent", name: "undock" },
              { type: "setProperty", name: "docked", value: false },
            ]);
            expect(hold.held).toBeUndefined();
            expect(hold.resendCommand()).toBeUndefined();
          }
        },
      ),
    );
  });

  it("requires a fresh run of still ticks after departure", () => {
    fc.assert(
      fc.property(
        pose,
        fc.integer({ min: DOCK.ticks, max: 2 * DOCK.ticks }),
        (location, stillTicks) => {
          const hold = new Hold(false);
          for (let i = 0; i < stillTicks; i++) {
            expect(hold.observe(true)).toBe(i + 1 >= DOCK.ticks);
          }
          hold.beginStep();
          hold.enter(location);
          hold.beginStep();
          hold.leave();
          for (let i = 1; i < DOCK.ticks; i++) {
            expect(hold.observe(true)).toBe(false);
          }
          expect(hold.observe(true)).toBe(true);
        },
      ),
    );
  });
});

const axis = fc.double({ min: -1, max: 1, noNaN: true });
const rawInput = fc.record({ moveX: axis, moveY: axis, jump: fc.boolean() });
const deckSeatInputs = fc.array(fc.option(rawInput, { nil: undefined }), {
  maxLength: 4,
});
const commands = fc.array(
  fc.record({ type: fc.constant("triggerEvent" as const), name: fc.string() }),
) as fc.Arbitrary<EngineCommand[]>;
const clearCells = fc.array(
  fc.record({
    x: fc.integer(),
    y: fc.integer(),
    z: fc.integer(),
    typeId: fc.string(),
  }),
);

describe("heldStep (ADR 0063, 0068)", () => {
  it("a held step stays put facing its hold yaw", () => {
    fc.assert(
      fc.property(yaw, deckSeatInputs, (y, inputs) => {
        const step = heldStep(dock, y, inputs);
        expect(step.impulse).toEqual({ x: 0, y: 0, z: 0 });
        expect(step.forward).toEqual(forward(y));
        expect(step.riders).toEqual({ thirdPerson: false, underwater: false });
        expect(step.dock).toBe(dock);
        expect(step.commands).toEqual([]);
      }),
    );
  });

  it("boards the deck riders only when the first deck seat pushes the stick", () => {
    fc.assert(
      fc.property(yaw, deckSeatInputs, (y, inputs) => {
        expect(heldStep(dock, y, inputs).boardDeckRiders).toBe(
          pushesStick(inputs[0]),
        );
      }),
    );
  });

  it("ignores every deck seat after the first", () => {
    fc.assert(
      fc.property(yaw, deckSeatInputs, (y, inputs) => {
        expect(heldStep(dock, y, [undefined, ...inputs]).boardDeckRiders).toBe(
          false,
        );
      }),
    );
  });

  it("does not board the deck riders when no deck seat is taken", () => {
    expect(heldStep(dock, 0, []).boardDeckRiders).toBe(false);
  });

  it("passes the kind's commands and clear cells through", () => {
    fc.assert(
      fc.property(
        yaw,
        deckSeatInputs,
        commands,
        clearCells,
        (y, inputs, c, clear) => {
          const step = heldStep(dock, y, inputs, { commands: c, clear });
          expect(step.commands).toBe(c);
          expect(step.clear).toBe(clear);
        },
      ),
    );
  });

  it("leaves the clear key out unless given", () => {
    fc.assert(
      fc.property(yaw, deckSeatInputs, (y, inputs) => {
        expect("clear" in heldStep(dock, y, inputs)).toBe(false);
        expect("clear" in heldStep(dock, y, inputs, { commands: [] })).toBe(
          false,
        );
      }),
    );
  });

  it("boards the deck riders only past the stick threshold", () => {
    const past = [{ moveX: 0, moveY: DOCK.stick + 0.01, jump: false }];
    const at = [{ moveX: 0, moveY: DOCK.stick, jump: false }];
    expect(heldStep(dock, 0, past).boardDeckRiders).toBe(true);
    expect(heldStep(dock, 0, at).boardDeckRiders).toBe(false);
  });
});
