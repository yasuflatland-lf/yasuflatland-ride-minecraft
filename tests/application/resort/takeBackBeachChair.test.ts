import fc from "fast-check";
import { expect, it } from "vitest";
import { TakeBackBeachChair } from "../../../src/application/resort/takeBackBeachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeBeachChairWorld } from "./fakeBeachChairWorld";

it("returns a plain item to the hitter, removes and announces on the third hit", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: BEACH_CHAIR_SPEC.recovery.resetTicks }),
      (tick, gap) => {
        const world = fakeBeachChairWorld();
        const take = new TakeBackBeachChair(world);
        const id = asBeachChairId("p");
        const player = asPlayerId("hitter");
        take.execute({ id, player, tick });
        take.execute({ id, player, tick: tick + gap });
        expect(world.remove).not.toHaveBeenCalled();
        expect(world.showHitsLeft.mock.calls).toEqual([
          [player, 2],
          [player, 1],
        ]);
        take.execute({ id, player, tick: tick + gap * 2 });
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(id, player);
        const effects = [world.dropItem, world.remove, world.showTaken];
        expect(effects.map((effect) => effect.mock.calls.length)).toEqual([
          1, 1, 1,
        ]);
        const order = effects.map(
          (effect) => effect.mock.invocationCallOrder[0],
        );
        expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
      },
    ),
  );
});
it("resets after a gap of 101 ticks", () => {
  const world = fakeBeachChairWorld();
  const take = new TakeBackBeachChair(world);
  const cmd = {
    id: asBeachChairId("p"),
    player: asPlayerId("h"),
    tick: 0,
  };
  take.execute(cmd);
  take.execute({ ...cmd, tick: 100 });
  take.execute({ ...cmd, tick: 201 });
  expect(world.remove).not.toHaveBeenCalled();
  expect(world.showHitsLeft).toHaveBeenNthCalledWith(2, cmd.player, 1);
  expect(world.showHitsLeft).toHaveBeenLastCalledWith(cmd.player, 2);
});

it("refused hits leave the counter unchanged in either form", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("chair" as const, "table" as const),
      fc.constantFrom("occupied" as const, "somethingOnTop" as const),
      fc.integer({ min: 1, max: 10 }),
      (form, reason, refusedHits) => {
        const world = fakeBeachChairWorld();
        const take = new TakeBackBeachChair(world);
        const cmd = {
          id: asBeachChairId("chair"),
          player: asPlayerId("p"),
          tick: 0,
        };
        take.execute(cmd);
        world.state.mockReturnValue({
          form,
          occupied: reason === "occupied",
          somethingOnTop: reason === "somethingOnTop",
        });
        for (let tick = 1; tick <= refusedHits; tick++)
          take.execute({ ...cmd, tick });
        expect(world.showRefused).toHaveBeenCalledTimes(refusedHits);
        expect(world.showRefused).toHaveBeenLastCalledWith(cmd.player, reason);
        expect(world.showHitsLeft).toHaveBeenCalledTimes(1);
        expect(world.dropItem).not.toHaveBeenCalled();
        world.state.mockReturnValue({
          form,
          occupied: false,
          somethingOnTop: false,
        });
        take.execute({ ...cmd, tick: refusedHits + 1 });
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(cmd.player, 1);
        take.execute({ ...cmd, tick: refusedHits + 2 });
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(
          cmd.id,
          cmd.player,
        );
      },
    ),
  );
});
it("ignores a chair that no longer exists", () => {
  const world = fakeBeachChairWorld();
  world.state.mockReturnValue(undefined);
  new TakeBackBeachChair(world).execute({
    id: asBeachChairId("missing"),
    player: asPlayerId("p"),
    tick: 0,
  });
  expect(world.showHitsLeft).not.toHaveBeenCalled();
  expect(world.dropItem).not.toHaveBeenCalled();
});
