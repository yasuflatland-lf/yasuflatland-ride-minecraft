import fc from "fast-check";
import { expect, it } from "vitest";
import {
  enter,
  leave,
  type Occupancy,
} from "../../../src/domain/camp/roofTent/occupancy";
import { asPlayerId } from "../../../src/domain/shared/ids";

const players = fc.string().map(asPlayerId);

it("enters only empty occupancy and leaves the previous value unchanged", () => {
  fc.assert(
    fc.property(players, players, (first, next) => {
      const empty: Occupancy = Object.freeze({ occupant: undefined });
      const occupied = enter(empty, first);
      expect(occupied).toEqual({ occupant: first });
      expect(empty.occupant).toBeUndefined();
      expect(Object.isFrozen(occupied)).toBe(true);
      if (!occupied) throw new Error("Empty occupancy must accept entry");
      expect(enter(occupied, next)).toBe(first === next ? occupied : undefined);
      expect(occupied.occupant).toBe(first);
      expect(leave(occupied, first)).toEqual(empty);
      expect(occupied.occupant).toBe(first);
    }),
  );
});

it("ignores a non-occupant leaving and permits reentry after the occupant leaves", () => {
  fc.assert(
    fc.property(players, players, (first, next) => {
      const occupied: Occupancy = Object.freeze({ occupant: first });
      const after = leave(occupied, next);
      expect(after).toEqual({ occupant: first === next ? undefined : first });
      if (first !== next) expect(after).toBe(occupied);
      const empty = leave(occupied, first);
      expect(Object.isFrozen(empty)).toBe(true);
      expect(leave(empty, next)).toBe(empty);
      expect(enter(empty, next)).toEqual({ occupant: next });
    }),
  );
});

it("matches a single-occupant model across sequences without mutating prior states", () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ entering: fc.boolean(), player: players })),
      (actions) => {
        let state: Occupancy = Object.freeze({ occupant: undefined });
        let occupant: Occupancy["occupant"];
        for (const action of actions) {
          const previous = state;
          const before = occupant;
          if (action.entering) {
            const result = enter(state, action.player);
            expect(result !== undefined).toBe(
              occupant === undefined || occupant === action.player,
            );
            if (occupant === undefined) occupant = action.player;
            state = result ?? state;
          } else {
            state = leave(state, action.player);
            if (occupant === action.player) occupant = undefined;
          }
          expect(previous.occupant).toBe(before);
          expect(state.occupant).toBe(occupant);
        }
      },
    ),
  );
});

it("makes own reentry idempotent, always refuses others, and always admits into empty", () => {
  fc.assert(
    fc.property(players, players, (owner, other) => {
      const occupied: Occupancy = Object.freeze({ occupant: owner });
      expect(enter(occupied, owner)).toEqual(occupied);
      const again = enter(occupied, owner);
      if (again) expect(enter(again, owner)).toEqual(again);
      if (other !== owner) expect(enter(occupied, other)).toBeUndefined();
      expect(enter({ occupant: undefined }, other)).toEqual({
        occupant: other,
      });
    }),
  );
});
