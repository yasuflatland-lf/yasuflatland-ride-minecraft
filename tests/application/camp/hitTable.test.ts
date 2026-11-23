import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { HitTable } from "../../../src/application/camp/hitTable";
import { asTableId } from "../../../src/domain/camp/table";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeTableWorld as fakeWorld } from "./fakeTableWorld";

const TABLE = asTableId("table");
const PLAYER = asPlayerId("player");

describe("HitTable (ADR 0152)", () => {
  it.each([PLAYER, undefined])(
    "takes the table back on the third hit in a row with player %s",
    (playerId) => {
      const world = fakeWorld();
      const hit = new HitTable(world);
      const results = [0, 10, 20].map((tick) =>
        hit.execute({ tableId: TABLE, tick, playerId }),
      );
      expect(results).toEqual([false, false, true]);
      expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(TABLE);
      expect(world.removeTable).toHaveBeenCalledExactlyOnceWith(TABLE);
      expect(vi.mocked(world.showHitsLeft).mock.calls).toEqual(
        playerId === undefined
          ? []
          : [
              [playerId, 2],
              [playerId, 1],
            ],
      );
    },
  );
});

it("leaves the table and its counter alone while either half holds an oven", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 2 }),
      fc.integer({ min: 1, max: 20 }),
      (ovens, hits) => {
        const world = fakeWorld();
        const hit = new HitTable(world);
        const command = { tableId: TABLE, playerId: PLAYER, tick: 0 };
        hit.execute(command);
        vi.mocked(world.itemsOnTable).mockReturnValue(ovens);
        for (let tick = 1; tick <= hits; tick++)
          expect(hit.execute({ ...command, tick })).toBe(false);
        expect(world.showOvenOnTop).toHaveBeenCalledTimes(hits);
        expect(world.removeTable).not.toHaveBeenCalled();
        vi.mocked(world.itemsOnTable).mockReturnValue(0);
        expect(hit.execute({ ...command, tick: hits + 1 })).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(PLAYER, 1);
        expect(hit.execute({ ...command, tick: hits + 2 })).toBe(true);
      },
    ),
  );
});
