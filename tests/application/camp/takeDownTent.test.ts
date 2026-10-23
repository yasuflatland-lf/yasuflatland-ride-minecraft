import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import { asTentId } from "../../../src/domain/camp/tent";
import {
  EMPTY_COUNTER,
  registerHit,
} from "../../../src/domain/shared/hitCounter";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeTentWorld } from "./fakeTentWorld";

const TENT = asTentId("tent");
const PLAYER = asPlayerId("p");
const RULE = {
  hits: TENT_SPEC.hitsToTakeDown,
  resetTicks: TENT_SPEC.hitResetTicks,
};

describe("TakeDownTent (ADR 0131)", () => {
  it("takes the tent down on the third hit, returning the item first, with 2 and 1 hits left before", () => {
    const world = new FakeTentWorld();
    const take = new TakeDownTent(world);
    expect(take.execute({ tentId: TENT, tick: 0, playerId: PLAYER })).toBe(
      false,
    );
    expect(take.execute({ tentId: TENT, tick: 50, playerId: PLAYER })).toBe(
      false,
    );
    expect(take.execute({ tentId: TENT, tick: 100, playerId: PLAYER })).toBe(
      true,
    );
    expect(world.calls).toEqual([
      ["showHitsLeft", PLAYER, 2],
      ["showHitsLeft", PLAYER, 1],
      ["returnTentItem", TENT, PLAYER],
      ["takeDown", TENT],
    ]);
  });

  it("starts the count again after a gap of more than 100 ticks", () => {
    const world = new FakeTentWorld();
    const take = new TakeDownTent(world);
    take.execute({ tentId: TENT, tick: 0 });
    take.execute({ tentId: TENT, tick: 10 });
    expect(take.execute({ tentId: TENT, tick: 111 })).toBe(false);
    expect(take.execute({ tentId: TENT, tick: 150 })).toBe(false);
    expect(take.execute({ tentId: TENT, tick: 160 })).toBe(true);
    expect(world.calls).toEqual([
      ["returnTentItem", TENT, undefined],
      ["takeDown", TENT],
    ]);
  });

  it("never counts a hit while someone is inside, and tells only a player", () => {
    const world = new FakeTentWorld();
    world.occupied = true;
    const take = new TakeDownTent(world);
    for (let t = 0; t < 5; t++)
      expect(take.execute({ tentId: TENT, tick: t, playerId: PLAYER })).toBe(
        false,
      );
    take.execute({ tentId: TENT, tick: 6 });
    expect(world.calls).toEqual(Array(5).fill(["showOccupied", PLAYER]));
  });

  it("takes the tent down exactly when registerHit reports it broken", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 150 }), fc.boolean()), {
          maxLength: 12,
        }),
        (steps) => {
          const world = new FakeTentWorld();
          const take = new TakeDownTent(world);
          let counter = EMPTY_COUNTER;
          let tick = 0;
          for (const [gap, occupied] of steps) {
            tick += gap;
            world.occupied = occupied;
            const r = registerHit(counter, tick, occupied, RULE);
            if (!occupied) counter = r.counter;
            const before = world.names().filter((n) => n === "takeDown").length;
            expect(take.execute({ tentId: TENT, tick })).toBe(r.broken);
            const after = world.names().filter((n) => n === "takeDown").length;
            expect(after - before).toBe(r.broken ? 1 : 0);
          }
        },
      ),
    );
  });
});
