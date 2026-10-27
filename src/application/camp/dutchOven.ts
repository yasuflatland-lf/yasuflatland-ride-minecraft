import type { DutchOvenId } from "../../domain/camp/dutchOven";
import { DUTCH_OVEN_SPEC } from "../../domain/camp/spec";
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { DutchOvenWorld } from "./ports/dutchOven";

export class DutchOvenActions {
  private readonly counters = new Map<DutchOvenId, HitCounter>();

  constructor(private readonly world: DutchOvenWorld) {}

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
    for (let dy = 1; dy <= DUTCH_OVEN_SPEC.clearance; dy++) {
      const at = { ...block, y: block.y + dy };
      if (
        !this.world.isAir(dimension, at) ||
        this.world.isVehicleSpace(dimension, at)
      )
        return false;
    }
    const at = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
    if (this.world.hasDutchOvenNear(dimension, at)) return false;
    if (!this.world.isCreative(player) && !this.world.consumeItem(player, slot))
      return false;
    this.world.spawnDutchOven(dimension, at, Math.round(yaw / 90) * 90);
    return true;
  }

  hit(id: DutchOvenId, player: PlayerId, tick: number): boolean {
    const result = registerHit(
      this.counters.get(id) ?? EMPTY_COUNTER,
      tick,
      false,
      {
        hits: DUTCH_OVEN_SPEC.hitsToTakeBack,
        resetTicks: DUTCH_OVEN_SPEC.hitResetTicks,
      },
    );
    if (result.broken) {
      this.counters.delete(id);
      this.world.dropItem(id);
      this.world.removeDutchOven(id);
      return true;
    }
    this.counters.set(id, result.counter);
    this.world.showHitsLeft(
      player,
      DUTCH_OVEN_SPEC.hitsToTakeBack - result.counter.count,
    );
    return false;
  }
}
