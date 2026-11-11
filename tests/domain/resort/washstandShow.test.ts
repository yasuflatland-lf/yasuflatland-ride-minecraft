import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { WASHSTAND_SPEC } from "../../../src/domain/resort/shows";
import {
  type WashstandEffect,
  type WashstandState,
  washstandInteract,
  washstandTick,
} from "../../../src/domain/resort/washstandShow";

const tickArb = fc.nat();
const idle: WashstandState = Object.freeze({ phase: "idle" });
const runningArb = tickArb.map((endsAt) =>
  Object.freeze({ phase: "running" as const, endsAt }),
);

describe("washstand show", () => {
  it("starts a full run when idle", () => {
    fc.assert(
      fc.property(tickArb, (now) => {
        const result = washstandInteract(idle, now);
        expectTypeOf(result.effect).toEqualTypeOf<WashstandEffect>();
        expect(result).toEqual({
          state: { phase: "running", endsAt: now + WASHSTAND_SPEC.runTicks },
          effect: "start_run",
        });
      }),
    );
  });

  it("ignores interaction while running, even past the deadline until a tick ends it", () => {
    fc.assert(
      fc.property(runningArb, tickArb, (state, now) => {
        for (const at of [now, state.endsAt, state.endsAt + now]) {
          const result = washstandInteract(state, at);
          expect(result.state).toBe(state);
          expect(result.effect).toBe("none");
        }
      }),
    );
  });

  it("leaves an idle washstand unchanged on every tick", () => {
    fc.assert(
      fc.property(tickArb, (now) => {
        const result = washstandTick(idle, now);
        expect(result.state).toBe(idle);
        expect(result.effect).toBe("none");
      }),
    );
  });

  it("preserves a run before its deadline and ends it exactly at or after it", () => {
    fc.assert(
      fc.property(tickArb, fc.nat(), (start, late) => {
        const state: WashstandState = Object.freeze({
          phase: "running",
          endsAt: start + WASHSTAND_SPEC.runTicks,
        });
        for (let now = start; now < state.endsAt; now++) {
          const result = washstandTick(state, now);
          expect(result.state).toBe(state);
          expect(result.effect).toBe("none");
        }
        for (const now of [state.endsAt, state.endsAt + late]) {
          const result = washstandTick(state, now);
          expect(result).toEqual({ state: idle, effect: "end_run" });
          expect(washstandTick(result.state, now)).toEqual({
            state: idle,
            effect: "none",
          });
        }
      }),
    );
  });

  it("allows a new full run after the previous run ends", () => {
    fc.assert(
      fc.property(tickArb, fc.nat(), (start, delay) => {
        const running = washstandInteract(idle, start).state;
        const now = start + WASHSTAND_SPEC.runTicks + delay;
        const ended = washstandTick(running, now).state;
        expect(washstandInteract(ended, now)).toEqual({
          state: { phase: "running", endsAt: now + WASHSTAND_SPEC.runTicks },
          effect: "start_run",
        });
      }),
    );
  });
});
