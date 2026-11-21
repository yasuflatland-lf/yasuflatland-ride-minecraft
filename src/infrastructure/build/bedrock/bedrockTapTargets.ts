import { type Entity, world } from "@minecraft/server";
import type {
  TapTargetPlacement,
  TapTargets,
} from "../../../application/build/ports/tapTargets";
import { cellCenter, sameCell } from "../../../domain/shared/cells";
import type { PlayerId } from "../../../domain/shared/ids";
import { allDimensions } from "../../shared/dimensions";
import { entityOfType } from "../../shared/entities";
import { TAP_TARGET_TYPE } from "../identifiers";

export class BedrockTapTargets implements TapTargets {
  private readonly placements = new Map<
    PlayerId,
    TapTargetPlacement & { entityId: string }
  >();

  show(playerId: PlayerId, at: TapTargetPlacement): void {
    const previous = this.placements.get(playerId);
    try {
      const entity =
        previous && entityOfType(world, previous.entityId, TAP_TARGET_TYPE);
      if (entity && previous?.dimensionId === at.dimensionId) {
        if (sameCell(previous.cell, at.cell)) return;
        entity.teleport(cellCenter(at.cell));
        this.placements.set(playerId, { ...at, entityId: entity.id });
        return;
      }
      entity?.remove();
      this.placements.delete(playerId);
      // Virtual endpoints are near the player, where script-spawned helpers stay loaded.
      const target = world
        .getDimension(at.dimensionId)
        .spawnEntity(TAP_TARGET_TYPE, cellCenter(at.cell));
      this.placements.set(playerId, { ...at, entityId: target.id });
    } catch {
      // A chunk can unload after the air check. The next preview retries.
    }
  }

  hide(playerId: PlayerId): void {
    const placement = this.placements.get(playerId);
    if (!placement) return;
    this.placements.delete(playerId);
    try {
      entityOfType(world, placement.entityId, TAP_TARGET_TYPE)?.remove();
    } catch {
      // The target can unload during teardown.
    }
  }

  ownerOf(
    entityId: string,
  ): (TapTargetPlacement & { playerId: PlayerId }) | undefined {
    for (const [playerId, placement] of this.placements) {
      if (placement.entityId === entityId)
        return {
          playerId,
          cell: placement.cell,
          dimensionId: placement.dimensionId,
        };
    }
    return undefined;
  }

  sweep(): void {
    const owned = new Set(
      [...this.placements.values()].map(({ entityId }) => entityId),
    );
    for (const dimension of allDimensions()) {
      for (const entity of dimension.getEntities({ type: TAP_TARGET_TYPE })) {
        if (!owned.has(entity.id)) removeIfLoaded(entity);
      }
    }
  }
}

function removeIfLoaded(entity: Entity): void {
  try {
    if (entity.isValid) entity.remove();
  } catch {
    // The target can unload between discovery and removal.
  }
}
