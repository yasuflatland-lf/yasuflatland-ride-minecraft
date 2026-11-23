import {
  canFoldFirePit,
  canToggleFirePit,
  type FirePitId,
} from "../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import { handleHit } from "../shared/takeBackByHits";
import type { FirePitWorld } from "./ports/firePit";

export class FirePitActions {
  private readonly hits = new HitCounters<FirePitId>(FIRE_PIT_SPEC.recovery);

  constructor(private readonly world: FirePitWorld) {}

  canUseBlock(dimension: DimensionId, block: Vec3, face: string): boolean {
    return canUseBlockTop(this.world, dimension, block, face);
  }

  place(cmd: {
    player?: PlayerId;
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
    holdsIgniter: boolean,
    slot: number,
  ): boolean {
    const lit = this.world.isLit(id);
    if (!canToggleFirePit(lit, holdsIgniter)) return false;
    this.world.setLit(id, !lit);
    if (!lit && player && !this.world.isCreative(player))
      this.world.wearFlintAndSteel(player, slot);
    return true;
  }

  hit(id: FirePitId, player: PlayerId | undefined, tick: number): boolean {
    if (!canFoldFirePit(this.world.isCovered(id))) {
      if (player !== undefined) this.world.showCoveredHint(player);
      return false;
    }
    let taken = false;
    handleHit(this.hits, id, tick, {
      drop: () => this.world.dropItem(id),
      remove: () => {
        this.world.removeFirePit(id);
        taken = true;
      },
      showRemaining: (left) => {
        if (player !== undefined) this.world.showHitsLeft(player, left);
      },
    });
    return taken;
  }
}
