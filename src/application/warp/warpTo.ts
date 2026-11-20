import type { PlayerId } from "../../domain/shared/ids";
import { ticks } from "../../domain/shared/ticks";
import type { WarpPointId } from "../../domain/warp/ids";
import { chooseLanding } from "../../domain/warp/landing";
import { WARP_SPEC } from "../../domain/warp/spec";
import type { WarpPoint } from "../../domain/warp/warpPoint";
import { findPoint, removePoint } from "../../domain/warp/warpRegistry";
import type { WarpFeedback } from "./ports/feedback";
import type { WarpRegistryStore } from "./ports/registryStore";
import type { WarpTicks } from "./ports/ticks";
import type { WarpWorld } from "./ports/world";

export class WarpTo {
  constructor(
    private readonly store: WarpRegistryStore,
    private readonly world: WarpWorld,
    private readonly feedback: WarpFeedback,
    private readonly ticks: WarpTicks,
  ) {}

  async run(playerId: PlayerId, pointId: WarpPointId): Promise<void> {
    const registry = this.store.load();
    if (!registry) {
      this.feedback.registryUnreadable(playerId);
      return;
    }
    const point = findPoint(registry, pointId);
    if (!point) return;
    const presence = this.world.presence(point);
    if (presence === "gone") {
      this.removeGone(playerId, point);
      return;
    }
    const feet = chooseLanding(point.cell, (feet) =>
      this.world.isStandable(point.dimension, feet),
    );
    if (!this.world.teleport(playerId, point.dimension, feet)) {
      this.feedback.teleportFailed(playerId);
      return;
    }
    if (presence !== "unloaded") return;
    let elapsed = 0;
    for (;;) {
      const arrival = this.world.presence(point);
      if (arrival === "gone") {
        this.removeGone(playerId, point);
        return;
      }
      if (arrival === "present" || elapsed >= WARP_SPEC.arrivalCheckMaxTicks)
        return;
      const step = ticks(
        Math.min(
          WARP_SPEC.arrivalCheckTicks,
          WARP_SPEC.arrivalCheckMaxTicks - elapsed,
        ),
      );
      await this.ticks.wait(step);
      elapsed += step;
    }
  }

  private removeGone(playerId: PlayerId, point: WarpPoint): void {
    const registry = this.store.load();
    if (!registry) {
      this.feedback.registryUnreadable(playerId);
      return;
    }
    if (findPoint(registry, point.id))
      this.store.save(removePoint(registry, point.id));
    this.feedback.pointGone(playerId, point);
  }
}
