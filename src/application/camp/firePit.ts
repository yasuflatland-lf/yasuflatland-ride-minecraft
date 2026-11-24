import {
  canFoldFirePit,
  canToggleFirePit,
  type FirePitId,
} from "../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../domain/camp/spec";
import type { BlockFace } from "../../domain/shared/blockFace";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { FirePitWorld } from "./ports/firePit";

export class FirePitActions {
  private readonly takeBack = new TakeBackByHits<FirePitId>({
    rule: FIRE_PIT_SPEC.recovery,
    refusal: (id) =>
      canFoldFirePit(this.world.isCovered(id)) ? undefined : "covered",
    showRefusal: (player) => this.world.showCoveredHint(player),
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.removeFirePit(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["giveBack", "remove"],
  });

  constructor(private readonly world: FirePitWorld) {}

  canUseBlock(dimension: DimensionId, block: Vec3, face: BlockFace): boolean {
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
    return this.takeBack.hit(id, tick, player) === "taken";
  }
}
