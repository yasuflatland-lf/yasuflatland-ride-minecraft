import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward } from "../../../../src/domain/shared/vec";
import type { Dock } from "../../../../src/domain/vehicle/dock";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
import {
  DOCK,
  heldStep,
  pushesStick,
} from "../../../../src/domain/vehicle/motion/dock";

const dock: Dock = {
  hold: { x: 0, y: 64, z: 0, yaw: 0 },
  cells: [],
  seats: [],
};
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
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
