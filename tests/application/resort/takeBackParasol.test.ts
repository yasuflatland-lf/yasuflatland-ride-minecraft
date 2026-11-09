import fc from "fast-check";
import { expect, it } from "vitest";
import { SyncParasolCeilings } from "../../../src/application/resort/syncParasolCeilings";
import { TakeBackParasol } from "../../../src/application/resort/takeBackParasol";
import { asParasolId } from "../../../src/domain/resort/ids";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeParasolWorld } from "./fakeParasolWorld";

it("clears the ceiling, returns a plain item to the hitter, removes and announces on the third hit", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: PARASOL_SPEC.hitResetTicks }),
      (tick, gap) => {
        const world = fakeParasolWorld();
        const take = new TakeBackParasol(world);
        const id = asParasolId("p");
        const player = asPlayerId("hitter");
        take.execute({ id, player, tick });
        take.execute({ id, player, tick: tick + gap });
        expect(world.remove).not.toHaveBeenCalled();
        expect(world.showRemaining.mock.calls).toEqual([
          [player, 2],
          [player, 1],
        ]);
        take.execute({ id, player, tick: tick + gap * 2 });
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(id, player);
        const effects = [
          world.clearCeiling,
          world.dropItem,
          world.remove,
          world.showTaken,
        ];
        expect(effects.map((effect) => effect.mock.calls.length)).toEqual([
          1, 1, 1, 1,
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
      fc.integer({ min: PARASOL_SPEC.hitResetTicks + 1, max: 10000 }),
      (gap) => {
        const world = fakeParasolWorld();
        const take = new TakeBackParasol(world);
        const cmd = { id: asParasolId("p"), player: asPlayerId("h"), tick: 0 };
        take.execute(cmd);
        take.execute({ ...cmd, tick: 1 });
        take.execute({ ...cmd, tick: gap + 1 });
        expect(world.remove).not.toHaveBeenCalled();
        expect(world.showRemaining).toHaveBeenLastCalledWith(cmd.player, 2);
      },
    ),
  );
});
it("restores every loaded parasol ceiling", () => {
  fc.assert(
    fc.property(fc.uniqueArray(fc.string()), (ids) => {
      const world = fakeParasolWorld();
      new SyncParasolCeilings(world).execute(ids.map(asParasolId));
      expect(world.layCeiling.mock.calls).toEqual(ids.map((id) => [id]));
    }),
  );
});
