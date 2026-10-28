import {
  canFoldFirePit,
  canToggleFirePit,
  type FirePitId,
} from "../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { FirePitWorld } from "./ports/firePit";

const RULE = {
  hits: FIRE_PIT_SPEC.hitsToTakeBack,
  resetTicks: FIRE_PIT_SPEC.hitResetTicks,
};

export class FirePitActions {
  private readonly hits = new HitCounters<FirePitId>(RULE);

  constructor(private readonly world: FirePitWorld) {}

  canUseBlock(dimension: DimensionId, block: Vec3, face: string): boolean {
    return face === "up" && !this.world.isOwnBlock(dimension, block);
  }

  place(cmd: {
    player: PlayerId;
    dimension: DimensionId;
    block: Vec3;
    yaw: number;
    slot: number;
  }): boolean {
    const { player, dimension, block, yaw, slot } = cmd;
    for (let dy = 1; dy <= FIRE_PIT_SPEC.clearance; dy++) {
      const at = { ...block, y: block.y + dy };
      if (
        !this.world.isAir(dimension, at) ||
        this.world.isVehicleSpace(dimension, at)
      )
        return false;
    }
    const at = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
    if (this.world.hasFirePitNear(dimension, at)) return false;
    if (!this.world.isCreative(player) && !this.world.consumeItem(player, slot))
      return false;
    this.world.spawnFirePit(dimension, at, Math.round(yaw / 90) * 90);
    return true;
  }

  toggle(
    id: FirePitId,
    player: PlayerId | undefined,
    heldItem: string | undefined,
    slot: number,
  ): boolean {
    const lit = this.world.isLit(id);
    if (!canToggleFirePit(lit, heldItem)) return false;
    this.world.setLit(id, !lit);
    if (!lit && player && !this.world.isCreative(player))
      this.world.wearFlintAndSteel(player, slot);
    return true;
  }

  hit(id: FirePitId, player: PlayerId, tick: number): boolean {
    if (!canFoldFirePit(this.world.isCovered(id))) {
      this.world.showCoveredHint(player);
      return false;
    }
    const result = this.hits.hit(id, tick, false);
    if (result.broken) {
      this.world.dropItem(id);
      this.world.removeFirePit(id);
      return true;
    }
    this.world.showHitsLeft(player, result.hitsLeft);
    return false;
  }
}
