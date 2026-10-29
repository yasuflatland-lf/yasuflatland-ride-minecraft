import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HitChair } from "../../../src/application/camp/hitChair";
import { asChairId } from "../../../src/domain/camp/chair";
import { CHAIR_SPEC } from "../../../src/domain/camp/spec";
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

  it.each(["low_chair", "noga_chair"] as const)(
    "folds %s on the third hit and drops exactly one item",
    (kind) => {
      const world = new FakeChairWorld();
      world.kind = kind;
      const hit = new HitChair(world);
      const results = [0, 10, 20].map((tick) =>
        hit.execute({
          kind,
          chairId: CHAIR,
          tick,
          playerId: PLAYER,
        }),
      );
      expect(results).toEqual([false, false, true]);
      expect(world.dropped).toEqual([CHAIR]);
      expect(world.removed).toEqual([CHAIR]);
      expect(world.hints).toEqual([
        { kind, playerId: PLAYER, hitsLeft: 2 },
        { kind, playerId: PLAYER, hitsLeft: 1 },
      ]);
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

  it("never takes back a chair hit more than the reset window apart", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: CHAIR_SPEC.hitResetTicks + 1, max: 1000 }), {
          maxLength: 20,
        }),
        (gaps) => {
          const world = new FakeChairWorld();
          const hit = new HitChair(world);
          let tick = 0;
          for (const gap of gaps) {
            tick += gap;
            hit.execute({
              kind: "low_chair",
              chairId: CHAIR,
              tick,
              playerId: PLAYER,
            });
          }
          expect(world.removed).toEqual([]);
          expect(
            world.hints.every(
              (h) => h.hitsLeft === CHAIR_SPEC.hitsToTakeBack - 1,
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("removes each chair once, drops one item per removal, and counts chairs apart", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            chair: fc.constantFrom("a", "b"),
            gap: fc.integer({ min: 0, max: CHAIR_SPEC.hitResetTicks * 2 }),
          }),
          { maxLength: 40 },
        ),
        (hits) => {
          const world = new FakeChairWorld();
          const hit = new HitChair(world);
          const streaks = new Map<string, { n: number; last: number }>();
          let tick = 0;
          for (const { chair, gap } of hits) {
            tick += gap;
            const s = streaks.get(chair);
            const n =
              s && tick - s.last <= CHAIR_SPEC.hitResetTicks ? s.n + 1 : 1;
            const removed = hit.execute({
              kind: "low_chair",
              chairId: asChairId(chair),
              tick,
            });
            expect(removed).toBe(n >= CHAIR_SPEC.hitsToTakeBack);
            if (removed) streaks.delete(chair);
            else streaks.set(chair, { n, last: tick });
          }
          expect(world.dropped).toEqual(world.removed);
          expect(world.hints).toEqual([]);
        },
      ),
    );
  });
});
