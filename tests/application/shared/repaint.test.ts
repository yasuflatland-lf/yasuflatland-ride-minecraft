import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RepaintWorld } from "../../../src/application/shared/ports/repaint";
import { Repaint } from "../../../src/application/shared/repaint";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import {
  effectivePaint,
  PAINTS,
  type Paint,
} from "../../../src/domain/shared/paint";

class FakeWorld implements RepaintWorld<string> {
  readonly paints = new Map<string, Paint>();
  readonly defaults = new Map<string, Paint>();
  readonly creative = new Set<PlayerId>();
  readonly creativeReads: PlayerId[] = [];
  readonly calls: string[] = [];
  private readonly pending = new Map<string, Paint>();

  constructor(private readonly lag = false) {}
  paintOf(id: string) {
    return this.paints.get(id);
  }
  defaultPaintOf(id: string) {
    return this.defaults.get(id);
  }
  setPaint(id: string, paint: Paint) {
    this.calls.push(`paint:${id}:${paint}`);
    (this.lag ? this.pending : this.paints).set(id, paint);
  }
  consumeDye(player: PlayerId, paint: Paint) {
    this.calls.push(`dye:${player}:${paint}`);
  }
  isCreative(player: PlayerId) {
    this.creativeReads.push(player);
    return this.creative.has(player);
  }
  nextTick() {
    for (const [id, paint] of this.pending) this.paints.set(id, paint);
    this.pending.clear();
  }
  remove(id: string) {
    this.paints.delete(id);
    this.defaults.delete(id);
    this.pending.delete(id);
  }
}
const paint = fc.constantFrom(...PAINTS);
const tick = fc.integer({ min: 0, max: 1_000_000 });
const p = asPlayerId("p");
const q = asPlayerId("q");
const command = (color: Paint, at = 0, playerId = p) => ({
  playerId,
  entityId: "a",
  paint: color,
  tick: at,
});
const setup = (from: Paint, defaultPaint: Paint, lag = false) => {
  const world = new FakeWorld(lag);
  world.paints.set("a", from);
  world.defaults.set("a", defaultPaint);
  return { world, repaint: new Repaint(world) };
};

describe("Repaint", () => {
  it("repaints a different shown color and consumes dye only outside Creative", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        fc.boolean(),
        (from, to, def, creative) => {
          fc.pre(effectivePaint(from, def) !== effectivePaint(to, def));
          const { world, repaint } = setup(from, def);
          if (creative) world.creative.add(p);
          expect(repaint.execute(command(to))).toBe(true);
          expect(world.calls).toEqual(
            creative ? [`paint:a:${to}`] : [`paint:a:${to}`, `dye:p:${to}`],
          );
        },
      ),
    );
  });
  it("keeps the dye when the shown colors are equal, including variant zero", () => {
    fc.assert(
      fc.property(paint, paint, paint, (from, to, def) => {
        fc.pre(effectivePaint(from, def) === effectivePaint(to, def));
        const { world, repaint } = setup(from, def);
        expect(repaint.execute(command(to))).toBe(false);
        expect(world.calls).toEqual([]);
        const defaultCase = setup("khaki", to);
        expect(defaultCase.repaint.execute(command(to))).toBe(false);
        expect(defaultCase.world.calls).toEqual([]);
      }),
    );
  });
  it("does nothing when either paint or default paint is missing", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        fc.boolean(),
        (from, to, def, missingPaint) => {
          const { world, repaint } = setup(from, def);
          (missingPaint ? world.paints : world.defaults).delete("a");
          expect(repaint.execute(command(to))).toBe(false);
          expect(world.calls).toEqual([]);
        },
      ),
    );
  });
  it("uses one dye for two same-tick hits despite engine lag (ADR 0037)", () => {
    fc.assert(
      fc.property(paint, paint, paint, tick, (from, to, def, at) => {
        fc.pre(effectivePaint(from, def) !== effectivePaint(to, def));
        const { world, repaint } = setup(from, def, true);
        expect(repaint.execute(command(to, at))).toBe(true);
        expect(repaint.execute(command(to, at, q))).toBe(false);
        world.nextTick();
        expect(repaint.execute(command(to, at + 1))).toBe(false);
        expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
      }),
    );
  });
  it("reads the world's paint again once the painting tick has passed", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        tick,
        fc.integer({ min: 1, max: 1_000 }),
        (from, to, def, at, later) => {
          fc.pre(effectivePaint(from, def) !== effectivePaint(to, def));
          const { world, repaint } = setup(from, def);
          expect(repaint.execute(command(to, at))).toBe(true);
          world.paints.set("a", from);
          expect(repaint.execute(command(to, at + later, q))).toBe(true);
          expect(world.calls).toEqual([
            `paint:a:${to}`,
            `dye:p:${to}`,
            `paint:a:${to}`,
            `dye:q:${to}`,
          ]);
        },
      ),
    );
  });
  it("repaints twice for different shown colors in the same tick", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        paint,
        tick,
        (from, first, second, def, at) => {
          fc.pre(effectivePaint(from, def) !== effectivePaint(first, def));
          fc.pre(effectivePaint(first, def) !== effectivePaint(second, def));
          const { world, repaint } = setup(from, def, true);
          expect(repaint.execute(command(first, at))).toBe(true);
          expect(repaint.execute(command(second, at, q))).toBe(true);
          expect(world.calls).toEqual([
            `paint:a:${first}`,
            `dye:p:${first}`,
            `paint:a:${second}`,
            `dye:q:${second}`,
          ]);
        },
      ),
    );
  });
  it("stops painting a removed entity in the same tick or later", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        paint,
        tick,
        (from, to, next, def, at) => {
          fc.pre(effectivePaint(from, def) !== effectivePaint(to, def));
          const { world, repaint } = setup(from, def, true);
          expect(repaint.execute(command(to, at))).toBe(true);
          world.remove("a");
          expect(repaint.execute(command(next, at))).toBe(false);
          world.nextTick();
          expect(repaint.execute(command(next, at + 1))).toBe(false);
          expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
        },
      ),
    );
  });
  it("asks about Creative only for the painting player", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        fc.boolean(),
        (from, to, def, otherCreative) => {
          fc.pre(effectivePaint(from, def) !== effectivePaint(to, def));
          const { world, repaint } = setup(from, def);
          if (otherCreative) world.creative.add(q);
          expect(repaint.execute(command(to))).toBe(true);
          expect(world.creativeReads).toEqual([p]);
          expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
        },
      ),
    );
  });
});
