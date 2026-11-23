import { expect, it } from "vitest";
import { FoldRoofTent } from "../../../src/application/camp/foldRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { FakeRoofTentWorld, PLAYER } from "./fakeRoofTentWorld";

it.each([PLAYER, undefined])(
  "returns the roof tent before removing it on the third hit (player %s)",
  (playerId) => {
    const world = new FakeRoofTentWorld();
    const fold = new FoldRoofTent(world);
    const tentId = asRoofTentId("tent");
    const hit = (tick: number) => fold.execute({ tentId, tick, playerId });
    expect(hit(0)).toBe(false);
    expect(hit(1)).toBe(false);
    expect(world.returnItem).not.toHaveBeenCalled();
    expect(hit(2)).toBe(true);
    expect(world.showHitsLeft.mock.calls).toEqual(
      playerId
        ? [
            [playerId, 2],
            [playerId, 1],
          ]
        : [],
    );
    expect(world.calls).toEqual([
      `return:tent:${playerId ?? "drop"}`,
      "remove:tent",
    ]);
    expect(world.showRefusal).not.toHaveBeenCalled();
  },
);

it("keeps separate hit counts for two roof tents", () => {
  const world = new FakeRoofTentWorld();
  const fold = new FoldRoofTent(world);
  const first = asRoofTentId("first");
  const second = asRoofTentId("second");
  const hit = (tentId: typeof first, tick: number) =>
    fold.execute({ tentId, tick, playerId: PLAYER });

  expect(hit(first, 0)).toBe(false);
  expect(hit(second, 1)).toBe(false);
  expect(hit(first, 2)).toBe(false);
  expect(hit(first, 3)).toBe(true);
  expect(world.remove).toHaveBeenCalledExactlyOnceWith(first);
  expect(hit(second, 4)).toBe(false);
  expect(hit(second, 5)).toBe(true);
  expect(world.remove).toHaveBeenNthCalledWith(2, second);
});
