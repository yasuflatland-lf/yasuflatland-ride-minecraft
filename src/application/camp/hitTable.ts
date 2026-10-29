import { TABLE_SPEC } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { TableWorld } from "./ports/table";

const RULE = {
  hits: TABLE_SPEC.hitsToTakeBack,
  resetTicks: TABLE_SPEC.hitResetTicks,
};

export class HitTable {
  private readonly hits = new HitCounters<TableId>(RULE);

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
    const result = this.hits.hit(cmd.tableId, cmd.tick, false);
    if (result.broken) {
      this.world.dropItem(cmd.tableId);
      this.world.removeTable(cmd.tableId);
      return true;
    }
    this.world.showHitsLeft(cmd.playerId, result.hitsLeft);
    return false;
  }
}
