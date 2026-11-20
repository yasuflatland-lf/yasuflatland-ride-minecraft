import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintTent } from "../../../src/application/camp/paintTent";
import type { TentPaintWorld } from "../../../src/application/camp/ports/tentPaint";
import { asTentId, type TentId } from "../../../src/domain/camp/tent";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { PAINTS, type Paint } from "../../../src/domain/shared/paint";

class FakeTentPaintWorld implements TentPaintWorld {
  readonly paints = new Map<TentId, Paint>();
  readonly creative = new Set<PlayerId>();
  readonly calls: string[] = [];
  readonly sounds: TentId[] = [];
  paintOf(id: TentId) {
    return this.paints.get(id);
  }
  paint(id: TentId, paint: Paint) {
    this.calls.push(`paint:${id}:${paint}`);
    this.paints.set(id, paint);
  }
  consumeDye(player: PlayerId, paint: Paint) {
    this.calls.push(`dye:${player}:${paint}`);
  }
  playPaintSound(id: TentId) {
    this.sounds.push(id);
  }
  isCreative(player: PlayerId) {
    return this.creative.has(player);
  }
}

const TENT = asTentId("tent");
const PLAYER = asPlayerId("player");
const paintArb = fc.constantFrom(...PAINTS);
const tickArb = fc.nat({ max: 1_000_000 });
describe("PaintTent (ADR 0031, 0036, 0037, 0076)", () => {
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

  it("restores variant 0 (khaki) with brown dye on a blue tent", () => {
    const world = new FakeTentPaintWorld();
    world.paints.set(TENT, "blue");
    const paintTent = new PaintTent(world);
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
