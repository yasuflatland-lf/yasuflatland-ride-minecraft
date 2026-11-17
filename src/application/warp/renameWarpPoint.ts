import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import {
  findPoint,
  pointAt,
  renamePoint,
} from "../../domain/warp/warpRegistry";
import { askWarpName } from "./askWarpName";
import type { WarpFeedback } from "./ports/feedback";
import type { WarpMenus } from "./ports/menus";
import type { WarpRegistryStore } from "./ports/registryStore";
import type { WarpTicks } from "./ports/ticks";

export class RenameWarpPoint {
  constructor(
    private readonly store: WarpRegistryStore,
    private readonly menus: WarpMenus,
    private readonly feedback: WarpFeedback,
    private readonly ticks: WarpTicks,
  ) {}

  async run({
    playerId,
    dimension,
    cell,
  }: {
    playerId: PlayerId;
    dimension: DimensionId;
    cell: Cell;
  }): Promise<void> {
    const registry = this.store.load();
    if (!registry) {
      this.feedback.registryUnreadable(playerId);
      return;
    }
    const point = pointAt(registry, dimension, cell);
    if (!point) return;
    const name = await askWarpName(
      this.menus,
      this.ticks,
      playerId,
      point.name,
    );
    if (!name) return;
    const current = this.store.load();
    if (!current) {
      this.feedback.registryUnreadable(playerId);
      return;
    }
    if (findPoint(current, point.id))
      this.store.save(renamePoint(current, point.id, name));
  }
}
