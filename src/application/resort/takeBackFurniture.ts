import {
  FURNITURE_SPEC,
  type FurnitureKind,
} from "../../domain/resort/furniture";
import type { FurnitureId } from "../../domain/resort/ids";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import { handleHit } from "../shared/takeBackByHits";
import type { FurnitureTakeBackWorld } from "./ports/furnitureWorld";

export class TakeBackFurniture {
  private readonly hits = new Map<FurnitureKind, HitCounters<FurnitureId>>();
  constructor(private readonly world: FurnitureTakeBackWorld) {}
  hit(cmd: { player: PlayerId; id: FurnitureId; now: number }): void {
    const kind = this.world.kindOf(cmd.id);
    if (kind === undefined) return;
    if (this.world.isOccupied(cmd.id)) {
      this.world.showRefused(cmd.player, "occupied");
      return;
    }
    if (this.world.somethingOnTop(cmd.id) || this.world.blockAboveTop(cmd.id)) {
      this.world.showRefused(cmd.player, "somethingOnTop");
      return;
    }
    let counters = this.hits.get(kind);
    if (!counters) {
      const spec = FURNITURE_SPEC[kind];
      counters = new HitCounters<FurnitureId>({
        hits: spec.hitsToTakeBack,
        resetTicks: spec.hitResetTicks,
      });
      this.hits.set(kind, counters);
    }
    handleHit(counters, cmd.id, cmd.now, {
      drop: () => this.world.dropItem(cmd.id, cmd.player),
      remove: () => {
        this.world.clearTop(cmd.id);
        this.world.remove(cmd.id);
        this.world.showTaken(cmd.player);
      },
      showRemaining: (left) => this.world.showHitsLeft(cmd.player, left),
    });
  }
}
