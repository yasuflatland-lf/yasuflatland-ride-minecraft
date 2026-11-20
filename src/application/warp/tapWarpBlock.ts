import { type Cell, cellKey } from "../../domain/shared/cells";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { ticks } from "../../domain/shared/ticks";
import { WARP_SPEC } from "../../domain/warp/spec";
import type { WarpBlockTaps } from "./ports/blockTaps";
import type { WarpTicks } from "./ports/ticks";
import type { RemoveWarpPoint } from "./removeWarpPoint";

/**
 * Counts taps on a warp block. Three taps inside the window break it; fewer
 * settle into opening the list. The list waits out the window because a form
 * opened on the first tap would swallow the second and third (ADR 0249).
 */
export class TapWarpBlock {
  private readonly counters = new HitCounters<string>({
    hits: WARP_SPEC.breakTaps,
    resetTicks: WARP_SPEC.tapWindowTicks,
  });
  private readonly lastTaps = new Map<string, number>();

  constructor(
    private readonly blocks: WarpBlockTaps,
    private readonly remove: RemoveWarpPoint,
    private readonly ticks: WarpTicks,
  ) {}

  /** Resolves `true` when this tap settled without breaking and is the last tap on the block. */
  async run(command: {
    playerId: PlayerId;
    dimension: DimensionId;
    cell: Cell;
    now: number;
  }): Promise<boolean> {
    const { playerId, dimension, cell, now } = command;
    const effects = this.blocks.at(playerId, dimension, cell);
    if (!effects) return false;
    const key = `${dimension}:${cellKey(cell)}`;
    this.counters.forgetStale(now);
    const result = this.counters.hit(key, now, false);
    if (result.broken) {
      this.lastTaps.delete(key);
      effects.remove();
      effects.drop();
      this.remove.run({ dimension, cell });
      return false;
    }
    effects.showRemaining(result.hitsLeft);
    this.lastTaps.set(key, now);
    await this.ticks.wait(ticks(WARP_SPEC.tapWindowTicks + 1));
    if (this.lastTaps.get(key) !== now) return false;
    this.lastTaps.delete(key);
    return true;
  }
}
