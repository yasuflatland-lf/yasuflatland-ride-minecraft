import type { GasLanternId } from "../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { SwitchCooldowns } from "../../domain/shared/switchCooldown";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "./groundPlacement";
import type { GasLanternWorld } from "./ports/gasLantern";

const RULE = {
  hits: GAS_LANTERN_SPEC.hitsToTakeBack,
  resetTicks: GAS_LANTERN_SPEC.hitResetTicks,
};

export class GasLanternActions {
  private readonly hits = new HitCounters<GasLanternId>(RULE);

  private readonly switches = new SwitchCooldowns<GasLanternId>();

  constructor(private readonly world: GasLanternWorld) {}

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
    return placeOnGround(this.world, GAS_LANTERN_SPEC, cmd, {
      isNear: this.world.hasGasLanternNear.bind(this.world),
      spawn: this.world.spawnGasLantern.bind(this.world),
    });
  }

  switch(id: GasLanternId, tick: number): boolean {
    this.switches.forgetIdle(tick);
    const lit = this.world.isLit(id);
    if (lit === undefined || !this.switches.tryUse(id, tick)) return false;
    this.world.setLit(id, !lit);
    this.world.relayLight(id, !lit);
    return true;
  }

  hit(id: GasLanternId, player: PlayerId, tick: number): boolean {
    const result = this.hits.hit(id, tick, false);
    if (result.broken) {
      this.world.clearLight(id);
      this.world.dropItem(id);
      this.world.removeGasLantern(id);
      return true;
    }
    this.world.showHitsLeft(player, result.hitsLeft);
    return false;
  }
}
