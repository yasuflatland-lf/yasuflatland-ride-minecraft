import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintRoofTent } from "../../../src/application/camp/paintRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  effectivePaint,
  PAINTS,
  type Paint,
} from "../../../src/domain/shared/paint";
import { FakeRoofTentWorld, PLAYER } from "./fakeRoofTentWorld";

const TENT = asRoofTentId("tent");
const paintArb = fc.constantFrom(...PAINTS);
const tickArb = fc.nat({ max: 1_000_000 });
const sameColor = (a: Paint, b: Paint) =>
  effectivePaint(a, ROOF_TENT_SPEC.defaultPaint) ===
  effectivePaint(b, ROOF_TENT_SPEC.defaultPaint);

function setup(current: Paint, creative = false, lag = false) {
  const world = new FakeRoofTentWorld();
  if (lag) world.paint.mockImplementation(() => {});
  const apply = world.paint.getMockImplementation();
  world.paint.mockImplementation((id, paint) => {
    world.calls.push(`paint:${id}:${paint}`);
    apply?.(id, paint);
  });
  world.consumeDye.mockImplementation((id, paint) => {
    world.calls.push(`dye:${id}:${paint}`);
  });
  world.playPaintSound.mockImplementation((id) => {
    world.sounds.push(id);
  });
  world.paints.set(TENT, current);
  world.isCreative.mockReturnValue(creative);
  return { world, paintRoofTent: new PaintRoofTent(world) };
}

describe("PaintRoofTent (ADR 0031, 0036, 0037, 0076)", () => {
  it("repaints with a dye of another color, using one dye outside Creative", () => {
    fc.assert(
      fc.property(
        paintArb,
        paintArb,
        tickArb,
        fc.boolean(),
        (current, paint, tick, creative) => {
          fc.pre(!sameColor(current, paint));
          const { world, paintRoofTent } = setup(current, creative);
          expect(
            paintRoofTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint,
              tick,
            }),
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
          const { world, paintRoofTent } = setup(current, creative);
          expect(
            paintRoofTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint,
              tick,
            }),
          ).toBe(false);
          expect(world.calls).toEqual([]);
        },
      ),
    );
  });

  it("never paints a tent that is gone, and keeps the dye", () => {
    fc.assert(
      fc.property(paintArb, tickArb, fc.boolean(), (paint, tick, creative) => {
        const world = new FakeRoofTentWorld();
        world.isCreative.mockReturnValue(creative);
        const paintRoofTent = new PaintRoofTent(world);
        expect(
          paintRoofTent.execute({
            playerId: PLAYER,
            tentId: TENT,
            paint,
            tick,
          }),
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
          const { world, paintRoofTent } = setup(current, false, true);
          const hit = (paint: Paint, t: number) =>
            paintRoofTent.execute({
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
          const { world, paintRoofTent } = setup(current, false, true);
          expect(
            paintRoofTent.execute({
              playerId: PLAYER,
              tentId: TENT,
              paint: first,
              tick,
            }),
          ).toBe(true);
          world.remove(TENT);
          const before = [...world.calls];
          expect(
            paintRoofTent.execute({
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
    const { world, paintRoofTent } = setup("blue");
    expect(
      paintRoofTent.execute({
        playerId: PLAYER,
        tentId: TENT,
        paint: "khaki",
        tick: 1,
      }),
    ).toBe(true);
    expect(world.paints.get(TENT)).toBe("khaki");
  });
});
