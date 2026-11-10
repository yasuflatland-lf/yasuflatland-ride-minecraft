import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TakeBackFurniture } from "../../../src/application/resort/takeBackFurniture";
import {
  FURNITURE_SPEC,
  type FurnitureKind,
} from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeFurnitureWorld } from "./fakeFurnitureWorld";

describe.each(Object.keys(FURNITURE_SPEC) as FurnitureKind[])("%s", (kind) => {
  const spec = FURNITURE_SPEC[kind];
  it("returns a plain item to the hitter, removes and announces on the third hit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 1, max: spec.hitResetTicks }),
        (now, gap) => {
          const world = fakeFurnitureWorld(kind);
          const take = new TakeBackFurniture(world);
          const id = asFurnitureId("p");
          const player = asPlayerId("hitter");
          take.hit({ id, player, now });
          take.hit({ id, player, now: now + gap });
          expect(world.remove).not.toHaveBeenCalled();
          expect(world.showHitsLeft.mock.calls).toEqual([
            [player, 2],
            [player, 1],
          ]);
          take.hit({ id, player, now: now + gap * 2 });
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
  it("restarts after a gap beyond the hit window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: spec.hitResetTicks + 1, max: 10000 }),
        (gap) => {
          const world = fakeFurnitureWorld(kind);
          const take = new TakeBackFurniture(world);
          const cmd = {
            id: asFurnitureId("p"),
            player: asPlayerId("h"),
            now: 0,
          };
          take.hit(cmd);
          take.hit({ ...cmd, now: 1 });
          take.hit({ ...cmd, now: gap + 1 });
          expect(world.remove).not.toHaveBeenCalled();
          expect(world.showHitsLeft).toHaveBeenLastCalledWith(cmd.player, 2);
        },
      ),
    );
  });

  it("refused hits leave the counter unchanged for either reason", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("occupied" as const, "somethingOnTop" as const),
        fc.integer({ min: 1, max: 10 }),
        (reason, refusedHits) => {
          const world = fakeFurnitureWorld(kind);
          const take = new TakeBackFurniture(world);
          const cmd = {
            id: asFurnitureId("chair"),
            player: asPlayerId("p"),
            now: 0,
          };
          take.hit(cmd);
          world.isOccupied.mockReturnValue(reason === "occupied");
          world.somethingOnTop.mockReturnValue(reason === "somethingOnTop");
          for (let now = 1; now <= refusedHits; now++)
            take.hit({ ...cmd, now });
          expect(world.showRefused).toHaveBeenCalledTimes(refusedHits);
          expect(world.showRefused).toHaveBeenLastCalledWith(
            cmd.player,
            reason,
          );
          expect(world.showHitsLeft).toHaveBeenCalledTimes(1);
          expect(world.dropItem).not.toHaveBeenCalled();
          world.isOccupied.mockReturnValue(false);
          world.somethingOnTop.mockReturnValue(false);
          take.hit({ ...cmd, now: refusedHits + 1 });
          expect(world.showHitsLeft).toHaveBeenLastCalledWith(cmd.player, 1);
          take.hit({ ...cmd, now: refusedHits + 2 });
          expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(
            cmd.id,
            cmd.player,
          );
        },
      ),
    );
  });
  it("ignores a chair that no longer exists", () => {
    const world = fakeFurnitureWorld(kind);
    world.kindOf.mockReturnValue(undefined);
    new TakeBackFurniture(world).hit({
      id: asFurnitureId("missing"),
      player: asPlayerId("p"),
      now: 0,
    });
    expect(world.showHitsLeft).not.toHaveBeenCalled();
    expect(world.dropItem).not.toHaveBeenCalled();
  });
});
