import { TABLE_SPEC } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { TableWorld } from "./ports/table";

const RULE = {
  hits: TABLE_SPEC.hitsToTakeBack,
  resetTicks: TABLE_SPEC.hitResetTicks,
};

export class HitTable {
  private readonly counters = new Map<TableId, HitCounter>();

  constructor(private readonly world: TableWorld) {}

  execute(cmd: {
    tableId: TableId;
    tick: number;
    playerId: PlayerId;
  }): boolean {
    if (this.world.ovensOnTable(cmd.tableId) > 0) {
      this.world.showOvenOnTop(cmd.playerId);
      return false;
    }
    const occupied = this.world.isOccupied(cmd.tableId);
    const result = registerHit(
      this.counters.get(cmd.tableId) ?? EMPTY_COUNTER,
      cmd.tick,
      occupied,
      RULE,
    );
    if (result.broken) {
      this.counters.delete(cmd.tableId);
      this.world.dropItem(cmd.tableId);
      this.world.removeTable(cmd.tableId);
      return true;
    }
    if (occupied) return false;
    this.counters.set(cmd.tableId, result.counter);
    this.world.showHitsLeft(cmd.playerId, RULE.hits - result.counter.count);
    return false;
  }
}
