import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { asWarpPointId } from "../../domain/warp/ids";
import { defaultWarpName } from "../../domain/warp/warpName";
import {
  addPoint,
  findPoint,
  pointAt,
  pointsOf,
  renamePoint,
} from "../../domain/warp/warpRegistry";
import { askWarpName } from "./askWarpName";
import type { WarpFeedback } from "./ports/feedback";
import type { WarpMenus } from "./ports/menus";
import type { WarpPlayers } from "./ports/players";
import type { WarpRegistryStore } from "./ports/registryStore";
import type { WarpTicks } from "./ports/ticks";

export class RegisterWarpPoint {
  // Pending forms can outlive a point, including across use case instances.
  private static nextId = 1;

  constructor(
    private readonly store: WarpRegistryStore,
    private readonly players: WarpPlayers,
    private readonly menus: WarpMenus,
    private readonly feedback: WarpFeedback,
    private readonly ticks: WarpTicks,
  ) {}

  async run(command: {
    playerId: PlayerId;
    dimension: DimensionId;
    cell: Cell;
  }): Promise<"registered" | "full" | "unavailable"> {
    const { playerId, dimension, cell } = command;
    const registry = this.store.load();
    if (!registry) {
      this.feedback.registryUnreadable(playerId);
      return "unavailable";
    }
    if (pointAt(registry, dimension, cell)) return "registered";
    let id = asWarpPointId(`warp-${RegisterWarpPoint.nextId++}`);
    while (findPoint(registry, id))
      id = asWarpPointId(`warp-${RegisterWarpPoint.nextId++}`);
    const name = defaultWarpName(pointsOf(registry).map((point) => point.name));
    const added = addPoint(registry, {
      id,
      name,
      owner: this.players.nameOf(playerId) ?? "",
      dimension,
      cell,
    });
    if (!added.ok) {
      this.feedback.registryFull(playerId);
      return "full";
    }
    this.store.save(added.registry);
    const answer = await askWarpName(this.menus, this.ticks, playerId);
    if (!answer) return "registered";
    const current = this.store.load();
    if (!current) {
      this.feedback.registryUnreadable(playerId);
      return "unavailable";
    }
    if (findPoint(current, id))
      this.store.save(renamePoint(current, id, answer));
    return "registered";
  }
}
