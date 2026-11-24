import fc from "fast-check";
import { expect, it } from "vitest";
import { TakeBackParasol } from "../../../src/application/resort/takeBackParasol";
import { asParasolId } from "../../../src/domain/resort/ids";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeParasolWorld } from "./fakeParasolWorld";

it("clears the ceiling, returns a plain item to the hitter, removes and announces on the third hit", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: PARASOL_SPEC.recovery.resetTicks }),
      (tick, gap) => {
        const world = fakeParasolWorld();
        const take = new TakeBackParasol(world);
        const id = asParasolId("p");
        const player = asPlayerId("hitter");
        take.execute({ id, player, tick });
        take.execute({ id, player, tick: tick + gap });
        expect(world.clearCeiling).not.toHaveBeenCalled();
        expect(world.remove).not.toHaveBeenCalled();
        expect(world.showHitsLeft.mock.calls).toEqual([
          [player, 2],
          [player, 1],
        ]);
        take.execute({ id, player, tick: tick + gap * 2 });
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(id, player);
        expect(world.clearCeiling).toHaveBeenCalledExactlyOnceWith(id);
        expect(world.remove).toHaveBeenCalledExactlyOnceWith(id);
        expect(world.showTaken).toHaveBeenCalledExactlyOnceWith(player);
        expect(world.clearCeiling).toHaveBeenCalledBefore(world.dropItem);
        expect(world.dropItem).toHaveBeenCalledBefore(world.remove);
        expect(world.remove).toHaveBeenCalledBefore(world.showTaken);
      },
    ),
  );
});
