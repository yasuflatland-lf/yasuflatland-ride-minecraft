import {
  FURNITURE_SPEC,
  type FurnitureKind,
} from "../../domain/resort/furniture";
import type { FurnitureId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { FurnitureTakeBackWorld } from "./ports/furnitureWorld";

type FurnitureRefusal = "occupied" | "somethingOnTop";

export class TakeBackFurniture {
  private readonly takeBackByKind = new Map<
    FurnitureKind,
    TakeBackByHits<FurnitureId, PlayerId, FurnitureRefusal>
  >();

  constructor(private readonly world: FurnitureTakeBackWorld) {}

  hit(cmd: { player: PlayerId; id: FurnitureId; now: number }): void {
    const kind = this.world.kindOf(cmd.id);
    if (kind === undefined) return;
    let takeBack = this.takeBackByKind.get(kind);
    if (!takeBack) {
      takeBack = new TakeBackByHits({
        rule: FURNITURE_SPEC[kind].recovery,
        refusal: (id) => {
          if (this.world.isOccupied(id)) return "occupied";
          if (this.world.somethingOnTop(id) || this.world.blockAboveTop(id))
            return "somethingOnTop";
          return undefined;
        },
        showRefusal: (player, reason) => this.world.showRefused(player, reason),
        release: (id) => this.world.clearTop(id),
        giveBack: (id, player) => this.world.dropItem(id, player),
        remove: (id) => this.world.remove(id),
        feedback: {
          remaining: (_id, player, left) =>
            this.world.showHitsLeft(player, left),
          taken: (_id, player) => this.world.showTaken(player),
        },
        order: ["giveBack", "release", "remove"],
      });
      this.takeBackByKind.set(kind, takeBack);
    }
    takeBack.hit(cmd.id, cmd.now, cmd.player);
  }
}
