import {
  canFoldFirePit,
  canToggleFirePit,
  type FirePitId,
} from "../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "./groundPlacement";
import type { FirePitWorld } from "./ports/firePit";

const RULE = {
  hits: FIRE_PIT_SPEC.hitsToTakeBack,
  resetTicks: FIRE_PIT_SPEC.hitResetTicks,
};

export class FirePitActions {
  private readonly hits = new HitCounters<FirePitId>(RULE);

  constructor(private readonly world: FirePitWorld) {}

  canUseBlock(dimension: DimensionId, block: Vec3, face: string): boolean {
    return canUseBlockTop(this.world, dimension, block, face);
  }

  place(cmd: {
    player: PlayerId;
    dimension: DimensionId;
    block: Vec3;
    yaw: number;
    slot: number;
  }): boolean {
    return placeOnGround(this.world, FIRE_PIT_SPEC, cmd, {
      isNear: this.world.hasFirePitNear.bind(this.world),
      spawn: this.world.spawnFirePit.bind(this.world),
    });
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
