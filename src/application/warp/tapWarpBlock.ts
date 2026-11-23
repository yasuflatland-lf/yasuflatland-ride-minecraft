import { type Cell, cellKey } from "../../domain/shared/cells";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { ticks } from "../../domain/shared/ticks";
import { WARP_SPEC } from "../../domain/warp/spec";
import { handleHit } from "../shared/takeBackByHits";
import type { WarpBlockTaps } from "./ports/blockTaps";
import type { WarpTicks } from "./ports/ticks";
import type { RemoveWarpPoint } from "./removeWarpPoint";

/**
 * Counts taps shared by all players on a block. Each player waits separately
 * to open the list, so the form does not cover that player’s next taps
 * (ADR 0249).
 */
export class TapWarpBlock {
  private readonly counters = new HitCounters<string>(WARP_SPEC.breakRule);
  /** Per block key, each player's latest unsettled tap tick. */
  private readonly lastTaps = new Map<string, Map<PlayerId, number>>();

  constructor(
    private readonly blocks: WarpBlockTaps,
    private readonly remove: RemoveWarpPoint,
    private readonly ticks: WarpTicks,
  ) {}

  /** Resolves `true` when this tap settled without breaking and is the player's last tap on the block. */
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
    const { broken } = handleHit(
      this.counters,
      key,
      now,
      {
        remove: () => {
          this.lastTaps.delete(key);
          effects.remove();
        },
        drop: () => effects.drop(),
        showRemaining: (left) => effects.showRemaining(left),
      },
      "removeThenDrop",
    );
    if (broken) {
      this.remove.run({ dimension, cell });
      return false;
    }
    const taps = this.lastTaps.get(key) ?? new Map<PlayerId, number>();
    taps.set(playerId, now);
    this.lastTaps.set(key, taps);
    await this.ticks.wait(ticks(WARP_SPEC.breakRule.resetTicks + 1));
    const pending = this.lastTaps.get(key);
    if (pending?.get(playerId) !== now) return false;
    pending.delete(playerId);
    if (pending.size === 0) this.lastTaps.delete(key);
    return true;
  }
}
