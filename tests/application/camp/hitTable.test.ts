import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { HitTable } from "../../../src/application/camp/hitTable";
import type { TableWorld } from "../../../src/application/camp/ports/table";
import { TABLE_SPEC } from "../../../src/domain/camp/spec";
import { asTableId } from "../../../src/domain/camp/table";
import { asPlayerId } from "../../../src/domain/shared/ids";

const TABLE = asTableId("table");
const PLAYER = asPlayerId("player");

function fakeWorld(occupied = false): TableWorld {
  return {
    isAir: vi.fn(() => true),
    isOwnBlock: vi.fn(() => false),
    isVehicleSpace: vi.fn(() => false),
    hasTableNear: vi.fn(() => false),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawnTable: vi.fn(),
    isOccupied: vi.fn(() => occupied),
    dropItem: vi.fn(),
    removeTable: vi.fn(),
    showHitsLeft: vi.fn(),
  };
}

describe("HitTable (ADR 0152)", () => {
  it("takes the table back on the third hit in a row, dropping one item", () => {
    const world = fakeWorld();
    const hit = new HitTable(world);
    const results = [0, 10, 20].map((tick) =>
      hit.execute({ tableId: TABLE, tick, playerId: PLAYER }),
    );
    expect(results).toEqual([false, false, true]);
    expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(TABLE);
    expect(world.removeTable).toHaveBeenCalledExactlyOnceWith(TABLE);
    expect(vi.mocked(world.showHitsLeft).mock.calls).toEqual([
      [PLAYER, 2],
      [PLAYER, 1],
    ]);
  });

  it("starts the count again after a break, so the next table needs three hits", () => {
    const world = fakeWorld();
    const hit = new HitTable(world);
    for (const tick of [0, 1, 2, 3]) {
      hit.execute({ tableId: TABLE, tick, playerId: PLAYER });
    }
    expect(world.removeTable).toHaveBeenCalledOnce();
    expect(world.showHitsLeft).toHaveBeenLastCalledWith(PLAYER, 2);
  });

  it("never takes back a table someone sits at, and shows no hint then", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 20 }),
        (gaps) => {
          const world = fakeWorld(true);
          const hit = new HitTable(world);
          let tick = 0;
          for (const gap of gaps) {
            tick += gap;
            expect(
              hit.execute({ tableId: TABLE, tick, playerId: PLAYER }),
            ).toBe(false);
          }
          expect(world.removeTable).not.toHaveBeenCalled();
          expect(world.dropItem).not.toHaveBeenCalled();
          expect(world.showHitsLeft).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it("never takes back a table hit more than the reset window apart", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: TABLE_SPEC.hitResetTicks + 1, max: 1000 }), {
          maxLength: 20,
        }),
        (gaps) => {
          const world = fakeWorld();
          const hit = new HitTable(world);
          let tick = 0;
          for (const gap of gaps) {
            tick += gap;
            hit.execute({ tableId: TABLE, tick, playerId: PLAYER });
          }
          expect(world.removeTable).not.toHaveBeenCalled();
          for (const [, left] of vi.mocked(world.showHitsLeft).mock.calls) {
            expect(left).toBe(TABLE_SPEC.hitsToTakeBack - 1);
          }
        },
      ),
    );
  });

  it("counts each table apart", () => {
    const world = fakeWorld();
    const hit = new HitTable(world);
    const other = asTableId("other");
    hit.execute({ tableId: TABLE, tick: 0, playerId: PLAYER });
    hit.execute({ tableId: other, tick: 1, playerId: PLAYER });
    hit.execute({ tableId: TABLE, tick: 2, playerId: PLAYER });
    expect(world.removeTable).not.toHaveBeenCalled();
    expect(hit.execute({ tableId: TABLE, tick: 3, playerId: PLAYER })).toBe(
      true,
    );
    expect(world.removeTable).toHaveBeenCalledExactlyOnceWith(TABLE);
  });
});
