import fc from "fast-check";
import { expect, it } from "vitest";
import {
  chooseExit,
  enter,
  fallbackExit,
  leave,
  mergeSpawnSetters,
  type Occupancy,
  roofTentState,
  withOccupant,
  withoutSpawnSetters,
  withSpawnSetter,
} from "../../../../src/domain/camp/roofTent/occupancy";
import { ROOF_TENT_SPEC } from "../../../../src/domain/camp/spec";
import { asPlayerId } from "../../../../src/domain/shared/ids";

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

const cells = fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() });

it("adds each setter once in first-seen order and leaves earlier states frozen", () => {
  fc.assert(
    fc.property(
      cells,
      players,
      fc.array(players),
      players,
      (exit, occupant, setters, next) => {
        const state = roofTentState({ exit, occupant, spawnSetters: setters });
        const updated = withSpawnSetter(state, next);
        expect(updated.spawnSetters).toEqual([...new Set([...setters, next])]);
        expect(withSpawnSetter(updated, next)).toEqual(updated);
        expect(state.spawnSetters).toEqual([...new Set(setters)]);
        expect(state).toEqual({
          exit,
          occupant,
          spawnSetters: [...new Set(setters)],
        });
        expect(Object.isFrozen(state)).toBe(true);
        expect(Object.isFrozen(state.exit)).toBe(true);
        expect(Object.isFrozen(state.spawnSetters)).toBe(true);
        expect(withOccupant(updated, undefined)).toEqual({
          ...updated,
          occupant: undefined,
        });
        expect(withoutSpawnSetters(updated)).toEqual({
          ...updated,
          spawnSetters: [],
        });
      },
    ),
  );
});

it("merges unique setters, including the legacy setter when present", () => {
  fc.assert(
    fc.property(
      fc.array(players),
      fc.option(players, { nil: undefined }),
      (stored, legacy) => {
        const merged = mergeSpawnSetters(stored, legacy);
        expect(merged).toEqual([
          ...new Set(legacy === undefined ? stored : [...stored, legacy]),
        ]);
        if (legacy !== undefined) expect(merged).toContain(legacy);
      },
    ),
  );
});

it("prefers the host exit, then the saved exit, then the fallback", () => {
  fc.assert(
    fc.property(cells, cells, cells, (host, saved, fallback) => {
      expect(chooseExit({ host, saved, fallback })).toBe(host);
      expect(chooseExit({ saved, fallback })).toBe(saved);
      expect(chooseExit({ fallback })).toBe(fallback);
    }),
  );
});

it("floors the fallback at the configured distance in the yaw direction", () => {
  const coordinate = fc.integer({ min: -4000, max: 4000 }).map((n) => n / 4);
  const locations = fc.record({ x: coordinate, y: coordinate, z: coordinate });
  fc.assert(
    fc.property(
      locations,
      fc.integer({ min: -180, max: 180 }),
      (location, yaw) => {
        const exit = fallbackExit(location, yaw);
        const yawRadians = (yaw * Math.PI) / 180;
        const distance = ROOF_TENT_SPEC.exitFallbackDistance;
        const targetX = location.x - Math.sin(yawRadians) * distance;
        const targetZ = location.z + Math.cos(yawRadians) * distance;
        expect([exit.x, exit.y, exit.z].every(Number.isInteger)).toBe(true);
        expect(exit.y).toBe(Math.floor(location.y));
        expect(targetX - exit.x).toBeGreaterThanOrEqual(0);
        expect(targetZ - exit.z).toBeGreaterThanOrEqual(0);
        expect(targetX - exit.x).toBeLessThan(1);
        expect(targetZ - exit.z).toBeLessThan(1);
      },
    ),
  );
});
