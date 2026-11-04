import { TABLE_SPEC } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { TableWorld } from "./ports/table";
import { handleHit } from "./takeBackByHits";

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
    if (this.world.itemsOnTable(cmd.tableId) > 0) {
      this.world.showOvenOnTop(cmd.playerId);
      return false;
    }
    let taken = false;
    handleHit(RULE, this.hits, cmd.tableId, cmd.tick, {
      drop: () => this.world.dropItem(cmd.tableId),
      remove: () => {
        this.world.removeTable(cmd.tableId);
        taken = true;
      },
      showRemaining: (left) => this.world.showHitsLeft(cmd.playerId, left),
    });
    return taken;
  }
}
