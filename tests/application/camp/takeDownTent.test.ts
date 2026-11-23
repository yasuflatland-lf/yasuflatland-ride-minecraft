import { describe, expect, it, vi } from "vitest";
import { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { asTentId } from "../../../src/domain/camp/tent";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeTentWorld } from "./fakeTentWorld";

const TENT = asTentId("tent");
const PLAYER = asPlayerId("p");

describe("TakeDownTent (ADR 0131)", () => {
  it.each([
    [PLAYER, true],
    [undefined, false],
  ] as const)(
    "takes the tent down on the third hit, returning the item first, with 2 and 1 hits left before",
    (playerId, loaded) => {
      const world = new FakeTentWorld();
      const take = new TakeDownTent(world);
      if (!loaded) vi.spyOn(world, "entityLoaded").mockReturnValue(false);
      const hit = (tick: number) =>
        take.execute({ tentId: TENT, tick, playerId });
      expect(hit(0)).toBe(false);
      expect(hit(1)).toBe(false);
      expect(world.calls).toEqual(
        playerId
          ? [
              ["showHitsLeft", playerId, 2],
              ["showHitsLeft", playerId, 1],
            ]
          : [],
      );
      world.calls.length = 0;
      expect(hit(2)).toBe(true);
      expect(world.calls.filter(([name]) => name !== "entityLoaded")).toEqual([
        ["returnTentItem", TENT, playerId],
        ["unlayBlocks", TENT],
        ...(loaded ? [] : [["clearBlocksByPose", TENT]]),
        ["removeTent", TENT],
      ]);
    },
  );

  it("never counts a hit while someone is inside, and tells only a player", () => {
    const world = new FakeTentWorld();
    const take = new TakeDownTent(world);
    take.execute({ tentId: TENT, tick: 0 });
    world.occupied = true;
    for (let t = 0; t < 5; t++)
      expect(take.execute({ tentId: TENT, tick: t, playerId: PLAYER })).toBe(
        false,
      );
    take.execute({ tentId: TENT, tick: 6 });
    expect(world.calls).toEqual(Array(5).fill(["showOccupied", PLAYER]));
    world.occupied = false;
    expect(take.execute({ tentId: TENT, tick: 7 })).toBe(false);
    expect(take.execute({ tentId: TENT, tick: 8 })).toBe(true);
  });
});
