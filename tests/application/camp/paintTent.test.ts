import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintTent } from "../../../src/application/camp/paintTent";
import type { TentPaintWorld } from "../../../src/application/camp/ports/tentPaint";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import { asTentId, type TentId } from "../../../src/domain/camp/tent";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import {
  effectivePaint,
  PAINTS,
  type Paint,
} from "../../../src/domain/shared/paint";

class FakeTentPaintWorld implements TentPaintWorld {
  readonly paints = new Map<TentId, Paint>();
  readonly creative = new Set<PlayerId>();
  readonly calls: string[] = [];
  private readonly pending = new Map<TentId, Paint>();

  constructor(private readonly lag = false) {}
  paintOf(id: TentId) {
    return this.paints.get(id);
  }
  paint(id: TentId, paint: Paint) {
    this.calls.push(`paint:${id}:${paint}`);
    (this.lag ? this.pending : this.paints).set(id, paint);
  }
  consumeDye(player: PlayerId, paint: Paint) {
    this.calls.push(`dye:${player}:${paint}`);
  }
  isCreative(player: PlayerId) {
    return this.creative.has(player);
  }
  nextTick() {
    for (const [id, paint] of this.pending) this.paints.set(id, paint);
    this.pending.clear();
  }
  remove(id: TentId) {
    this.paints.delete(id);
    this.pending.delete(id);
  }
}

const TENT = asTentId("tent");
const PLAYER = asPlayerId("player");
const paintArb = fc.constantFrom(...PAINTS);
const tickArb = fc.nat({ max: 1_000_000 });
const sameColor = (a: Paint, b: Paint) =>
  effectivePaint(a, TENT_SPEC.defaultPaint) ===
  effectivePaint(b, TENT_SPEC.defaultPaint);

function setup(current: Paint, creative = false, lag = false) {
  const world = new FakeTentPaintWorld(lag);
  world.paints.set(TENT, current);
  if (creative) world.creative.add(PLAYER);
  return { world, paintTent: new PaintTent(world) };
}

describe("PaintTent (ADR 0031, 0036, 0037, 0076)", () => {
  it("repaints with a dye of another color, using one dye outside Creative", () => {
    fc.assert(
      fc.property(
        paintArb,
        paintArb,
        tickArb,
        fc.boolean(),
        (current, paint, tick, creative) => {
          fc.pre(!sameColor(current, paint));
          const { world, paintTent } = setup(current, creative);
          expect(
            paintTent.execute({ playerId: PLAYER, tentId: TENT, paint, tick }),
          ).toBe(true);
          expect(world.calls).toEqual([
            `paint:${TENT}:${paint}`,
            ...(creative ? [] : [`dye:${PLAYER}:${paint}`]),
          ]);
        },
      ),
    );
  });

  it("keeps the dye when it is the color the tent already shows", () => {
    fc.assert(
      fc.property(
        paintArb,
        paintArb,
        tickArb,
        fc.boolean(),
        (current, paint, tick, creative) => {
          fc.pre(sameColor(current, paint));
          const { world, paintTent } = setup(current, creative);
          expect(
            paintTent.execute({ playerId: PLAYER, tentId: TENT, paint, tick }),
          ).toBe(false);
          expect(world.calls).toEqual([]);
        },
      ),
    );
  });

  it("never paints a tent that is gone, and keeps the dye", () => {
    fc.assert(
      fc.property(paintArb, tickArb, fc.boolean(), (paint, tick, creative) => {
        const world = new FakeTentPaintWorld();
        if (creative) world.creative.add(PLAYER);
        const paintTent = new PaintTent(world);
        expect(
          paintTent.execute({ playerId: PLAYER, tentId: TENT, paint, tick }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }),
    );
  });

  it("paints once for two identical hits in a tick, again for another dye, and rereads after the tick", () => {
    fc.assert(
      fc.property(
        paintArb,
        paintArb,
        paintArb,
        tickArb,
        (current, first, second, tick) => {
          fc.pre(!sameColor(current, first) && !sameColor(first, second));
          const { world, paintTent } = setup(current, false, true);
          const hit = (paint: Paint, t: number) =>
            paintTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint,
              tick: t,
            });
          expect(hit(first, tick)).toBe(true);
          expect(hit(first, tick)).toBe(false);
          expect(world.calls).toEqual([
            `paint:${TENT}:${first}`,
            `dye:${PLAYER}:${first}`,
          ]);
          expect(hit(second, tick)).toBe(true);
          expect(world.calls).toHaveLength(4);
          world.nextTick();
          // Set outside the use case, so only a fresh read sees first; the
          // tick-t memory still says second.
          world.paints.set(TENT, first);
          expect(hit(first, tick + 1)).toBe(false);
          expect(world.calls).toHaveLength(4);
          expect(hit(second, tick + 1)).toBe(true);
          expect(world.calls).toHaveLength(6);
        },
      ),
    );
  });

  it("ignores a second hit in the same tick once the tent is removed", () => {
    fc.assert(
      fc.property(
        paintArb,
        paintArb,
        paintArb,
        tickArb,
        (current, first, second, tick) => {
          fc.pre(!sameColor(current, first));
          const { world, paintTent } = setup(current, false, true);
          expect(
            paintTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint: first,
              tick,
            }),
          ).toBe(true);
          world.remove(TENT);
          const before = [...world.calls];
          expect(
            paintTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint: second,
              tick,
            }),
          ).toBe(false);
          expect(world.calls).toEqual(before);
        },
      ),
    );
  });

  it("restores variant 0 (khaki) with brown dye on a blue tent", () => {
    const { world, paintTent } = setup("blue");
    expect(
      paintTent.execute({
        playerId: PLAYER,
        tentId: TENT,
        paint: "khaki",
        tick: 1,
      }),
    ).toBe(true);
    expect(world.paints.get(TENT)).toBe("khaki");
  });
});
