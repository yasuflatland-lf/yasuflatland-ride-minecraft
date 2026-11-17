import type { PlayerId } from "../../domain/shared/ids";
import { pruneGone } from "../../domain/warp/presence";
import { WARP_SPEC } from "../../domain/warp/spec";
import { orderForPlayer, pageOf } from "../../domain/warp/warpOrder";
import { pointsOf } from "../../domain/warp/warpRegistry";
import type { WarpFeedback } from "./ports/feedback";
import type { WarpMenus } from "./ports/menus";
import type { WarpPlayers } from "./ports/players";
import type { WarpRegistryStore } from "./ports/registryStore";
import type { WarpWorld } from "./ports/world";
import type { WarpTo } from "./warpTo";

export class OpenWarpList {
  constructor(
    private readonly store: WarpRegistryStore,
    private readonly world: WarpWorld,
    private readonly players: WarpPlayers,
    private readonly menus: WarpMenus,
    private readonly feedback: WarpFeedback,
    private readonly warpTo: WarpTo,
  ) {}

  async run(playerId: PlayerId): Promise<void> {
    let pageIndex = 0;
    for (;;) {
      const registry = this.store.load();
      if (!registry) {
        this.feedback.registryUnreadable(playerId);
        return;
      }
      const location = this.players.locationOf(playerId);
      if (!location) return;
      const pruned = pruneGone(registry, (point) => this.world.presence(point));
      if (pruned.removed.length) this.store.save(pruned.registry);
      const points = orderForPlayer(pointsOf(pruned.registry), location);
      if (!points.length) {
        this.feedback.noPoints(playerId);
        return;
      }
      const page = pageOf(points, pageIndex, WARP_SPEC.pageSize);
      const answer = await this.menus.chooseWarp(playerId, {
        entries: page.items.map((point) => ({
          point,
          unverified: pruned.unverified.has(point.id),
        })),
        pageIndex: page.pageIndex,
        pageCount: page.pageCount,
      });
      if (answer.kind === "page") pageIndex = answer.pageIndex;
      else {
        if (answer.kind === "warp") await this.warpTo.run(playerId, answer.id);
        return;
      }
    }
  }
}
