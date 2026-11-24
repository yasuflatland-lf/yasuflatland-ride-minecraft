import { TABLE_SPEC } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { TableWorld } from "./ports/table";

export class HitTable {
  private readonly takeBack = new TakeBackByHits<TableId>({
    rule: TABLE_SPEC.recovery,
    refusal: (id) =>
      this.world.itemsOnTable(id) > 0 ? "somethingOnTop" : undefined,
    showRefusal: (player) => this.world.showOvenOnTop(player),
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.removeTable(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["giveBack", "remove"],
  });

  constructor(private readonly world: TableWorld) {}

  execute(cmd: {
    tableId: TableId;
    tick: number;
    playerId?: PlayerId;
  }): boolean {
    return this.takeBack.hit(cmd.tableId, cmd.tick, cmd.playerId) === "taken";
  }
}
