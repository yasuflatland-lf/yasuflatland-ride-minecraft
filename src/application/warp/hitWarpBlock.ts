import { type Cell, cellKey } from "../../domain/shared/cells";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { WARP_SPEC } from "../../domain/warp/spec";
import { handleHit } from "../shared/takeBackByHits";
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
    handleHit(this.counters, `${dimension}:${cellKey(cell)}`, now, {
      drop: () => effects.drop(),
      showRemaining: (left) => effects.showRemaining(left),
      remove: () => {
        effects.remove();
        this.remove.run({ dimension, cell });
      },
    });
  }
}
