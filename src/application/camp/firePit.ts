import { canToggleFirePit, type FirePitId } from "../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../domain/camp/spec";
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { FirePitWorld } from "./ports/firePit";

export class FirePitActions {
  private readonly counters = new Map<FirePitId, HitCounter>();

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
    const result = registerHit(
      this.counters.get(id) ?? EMPTY_COUNTER,
      tick,
      false,
      {
        hits: FIRE_PIT_SPEC.hitsToTakeBack,
        resetTicks: FIRE_PIT_SPEC.hitResetTicks,
      },
    );
    if (result.broken) {
      this.counters.delete(id);
      this.world.dropItem(id);
      this.world.removeFirePit(id);
      return true;
    }
    this.counters.set(id, result.counter);
    this.world.showHitsLeft(
      player,
      FIRE_PIT_SPEC.hitsToTakeBack - result.counter.count,
    );
    return false;
  }
}
