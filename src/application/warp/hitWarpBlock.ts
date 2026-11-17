import { type Cell, cellKey } from "../../domain/shared/cells";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { WARP_SPEC } from "../../domain/warp/spec";
import type { WarpBlockHits } from "./ports/blockHits";
import type { RemoveWarpPoint } from "./removeWarpPoint";

export class HitWarpBlock {
  private readonly counters = new HitCounters<string>({
    hits: WARP_SPEC.breakHits,
    resetTicks: WARP_SPEC.breakResetTicks,
  });

  constructor(
    private readonly blocks: WarpBlockHits,
    private readonly remove: RemoveWarpPoint,
  ) {}

  run(command: {
    playerId: PlayerId;
    dimension: DimensionId;
    cell: Cell;
    now: number;
  }): void {
    const { playerId, dimension, cell, now } = command;
    const effects = this.blocks.at(playerId, dimension, cell);
    if (!effects) return;
    this.counters.forgetStale(now);
    const result = this.counters.hit(
      `${dimension}:${cellKey(cell)}`,
      now,
      false,
    );
    if (!result.broken) {
      effects.showRemaining(result.hitsLeft);
      return;
    }
    effects.remove();
    effects.drop();
    this.remove.run({ dimension, cell });
  }
}
