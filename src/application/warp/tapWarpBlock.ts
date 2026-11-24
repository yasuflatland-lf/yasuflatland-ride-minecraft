import { type Cell, cellKey } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { ticks } from "../../domain/shared/ticks";
import { WARP_SPEC } from "../../domain/warp/spec";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { WarpBlockTapEffects, WarpBlockTaps } from "./ports/blockTaps";
import type { WarpTicks } from "./ports/ticks";
import type { RemoveWarpPoint } from "./removeWarpPoint";

/**
 * Counts taps shared by all players on a block. Each player waits separately
 * to open the list, so the form does not cover that player’s next taps
 * (ADR 0249).
 */
export class TapWarpBlock {
  /** Per block key, each player's latest unsettled tap tick. */
  private readonly lastTaps = new Map<string, Map<PlayerId, number>>();

  private readonly takeBack = new TakeBackByHits<
    { key: string; effects: WarpBlockTapEffects },
    PlayerId
  >({
    rule: WARP_SPEC.breakRule,
    key: ({ key }) => key,
    release: ({ key }) => this.lastTaps.delete(key),
    remove: ({ effects }) => effects.remove(),
    giveBack: ({ effects }) => effects.drop(),
    feedback: {
      remaining: ({ effects }, _player, left) => effects.showRemaining(left),
    },
    order: ["release", "remove", "giveBack"],
  });

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
    const result = this.takeBack.hit({ key, effects }, now, playerId);
    if (result === "taken") {
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
