import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import {
  type ToiletEffect,
  type ToiletState,
  toiletInteract,
  toiletRiderGone,
  toiletTick,
} from "../../../src/domain/resort/toiletShow";
import { asPlayerId } from "../../../src/domain/shared/ids";

const playerArb = fc.string().map(asPlayerId);
const tickArb = fc.nat();
const empty: ToiletState = Object.freeze({ phase: "empty" });
const seatedArb = playerArb.map((rider) =>
  Object.freeze({ phase: "seated" as const, rider }),
);
const flushingArb = tickArb.map((endsAt) =>
  Object.freeze({ phase: "flushing" as const, endsAt }),
);

describe("toilet show", () => {
  it("seats the interacting player only when empty", () => {
    fc.assert(
      fc.property(playerArb, (player) => {
        const result = toiletInteract(empty, player);
        expectTypeOf(result.effect).toEqualTypeOf<ToiletEffect>();
        expect(result).toEqual({
          state: { phase: "seated", rider: player },
          effect: "seat",
        });
      }),
    );
  });

  it("refuses both the current rider and a second player without replacing the rider", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(playerArb, { minLength: 2, maxLength: 2 }),
        (players) => {
          const [rider, visitor] = players;
          if (rider === undefined || visitor === undefined)
            throw new Error("Expected two distinct players");
          const state: ToiletState = Object.freeze({ phase: "seated", rider });
          for (const player of [rider, visitor]) {
            const result = toiletInteract(state, player);
            expect(result.state).toBe(state);
            expect(result.effect).toBe("refuse_occupied");
          }
        },
      ),
    );
  });

  it("refuses interaction throughout the flushing phase", () => {
    fc.assert(
      fc.property(flushingArb, playerArb, (state, player) => {
        const result = toiletInteract(state, player);
        expect(result.state).toBe(state);
        expect(result.effect).toBe("refuse_flushing");
      }),
    );
  });

  it("starts a full flush when the seated rider is gone", () => {
    fc.assert(
      fc.property(seatedArb, tickArb, (state, now) => {
        expect(toiletRiderGone(state, now)).toEqual({
          state: { phase: "flushing", endsAt: now + TOILET_SPEC.flushTicks },
          effect: "start_flush",
        });
      }),
    );
  });

  it("ignores rider-gone when empty or flushing without restarting the deadline", () => {
    fc.assert(
      fc.property(flushingArb, tickArb, (flushing, now) => {
        for (const state of [empty, flushing]) {
          const result = toiletRiderGone(state, now);
          expect(result.state).toBe(state);
          expect(result.effect).toBe("none");
        }
      }),
    );
  });

  it("keeps empty and seated states unchanged on every tick", () => {
    fc.assert(
      fc.property(seatedArb, tickArb, (seated, now) => {
        for (const state of [empty, seated]) {
          const result = toiletTick(state, now);
          expect(result.state).toBe(state);
          expect(result.effect).toBe("none");
        }
      }),
    );
  });

  it("preserves a flush before its deadline and ends it exactly at or after it", () => {
    fc.assert(
      fc.property(tickArb, fc.nat(), (start, late) => {
        const state: ToiletState = Object.freeze({
          phase: "flushing",
          endsAt: start + TOILET_SPEC.flushTicks,
        });
        for (let now = start; now < state.endsAt; now++) {
          const result = toiletTick(state, now);
          expect(result.state).toBe(state);
          expect(result.effect).toBe("none");
        }
        for (const now of [state.endsAt, state.endsAt + late]) {
          const result = toiletTick(state, now);
          expect(result).toEqual({ state: empty, effect: "end_flush" });
          expect(toiletTick(result.state, now)).toEqual({
            state: empty,
            effect: "none",
          });
        }
      }),
    );
  });

  it("accepts another rider after a complete flush", () => {
    fc.assert(
      fc.property(playerArb, playerArb, tickArb, (first, next, now) => {
        const seated = toiletInteract(empty, first).state;
        const flushing = toiletRiderGone(seated, now).state;
        const ended = toiletTick(flushing, now + TOILET_SPEC.flushTicks).state;
        expect(toiletInteract(ended, next)).toEqual({
          state: { phase: "seated", rider: next },
          effect: "seat",
        });
      }),
    );
  });
});
