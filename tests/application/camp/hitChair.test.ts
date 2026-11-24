import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { HitChair } from "../../../src/application/camp/hitChair";
import { asChairId } from "../../../src/domain/camp/chair";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeChairWorld } from "./fakeChairWorld";

const CHAIR = asChairId("chair");
const PLAYER = asPlayerId("player");

describe("HitChair (ADR 0122)", () => {
  it("ignores unknown entity kinds", () => {
    const world = new FakeChairWorld();
    world.kind = undefined;
    const hit = new HitChair(world);
    for (const tick of [0, 10, 20])
      expect(
        hit.execute({
          kind: "low_chair",
          chairId: CHAIR,
          tick,
          playerId: PLAYER,
        }),
      ).toBe(false);
    expect(world.dropped).toEqual([]);
    expect(world.removed).toEqual([]);
    expect(world.hints).toEqual([]);
  });

  it.each([
    ["low_chair", PLAYER],
    ["noga_chair", PLAYER],
    ["low_chair", undefined],
  ] as const)(
    "folds %s on the third hit and drops exactly one item (player %s)",
    (kind, playerId) => {
      const world = new FakeChairWorld();
      world.kind = kind;
      const drop = vi.spyOn(world, "dropChairItem");
      const remove = vi.spyOn(world, "removeChair");
      const hit = new HitChair(world);
      const results = [0, 10, 20].map((tick) =>
        hit.execute({
          kind,
          chairId: CHAIR,
          tick,
          playerId,
        }),
      );
      expect(results).toEqual([false, false, true]);
      expect(world.dropped).toEqual([CHAIR]);
      expect(world.removed).toEqual([CHAIR]);
      expect(drop).toHaveBeenCalledExactlyOnceWith(CHAIR, playerId);
      expect(drop).toHaveBeenCalledBefore(remove);
      expect(world.hints).toEqual(
        playerId
          ? [
              { kind, playerId, hitsLeft: 2 },
              { kind, playerId, hitsLeft: 1 },
            ]
          : [],
      );
    },
  );

  it.each(["low_chair", "noga_chair"] as const)(
    "does not count hits while someone sits on %s",
    (kind) => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 20 }),
          (gaps) => {
            const world = new FakeChairWorld();
            world.kind = kind;
            world.occupied.add(CHAIR);
            const hit = new HitChair(world);
            let tick = 0;
            for (const gap of gaps) {
              tick += gap;
              expect(
                hit.execute({
                  kind,
                  chairId: CHAIR,
                  tick,
                  playerId: PLAYER,
                }),
              ).toBe(false);
            }
            expect(world.removed).toEqual([]);
            expect(world.dropped).toEqual([]);
            expect(world.hints).toEqual([]);
          },
        ),
      );
    },
  );
});
