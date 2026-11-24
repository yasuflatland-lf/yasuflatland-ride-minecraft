import {
  asGasLanternId,
  type GasLanternId,
} from "../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../domain/camp/spec";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { TakeBackByHits } from "../shared/takeBackByHits";
import { campHostedKind, HostedOnTopActions } from "./hostedKind";
import type { GasLanternWorld } from "./ports/gasLantern";

export function gasLanternHostedKind(world: GasLanternWorld): HostedKindPort {
  return campHostedKind(
    {
      asId: asGasLanternId,
      loaded: () => world.loadedGasLanterns(),
      remove: (lantern) => {
        world.clearLight(lantern);
        world.removeGasLantern(lantern);
      },
    },
    world,
  );
}

export class GasLanternActions extends HostedOnTopActions {
  private readonly takeBack = new TakeBackByHits<GasLanternId>({
    rule: GAS_LANTERN_SPEC.recovery,
    release: (id) => this.world.clearLight(id),
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.removeGasLantern(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["release", "giveBack", "remove"],
  });

  private readonly switches = new Debounces<GasLanternId>(
    LIGHT_SWITCH_COOLDOWN_TICKS,
  );

  constructor(
    private readonly world: GasLanternWorld,
    onTop: HostedItemKind,
  ) {
    super(world, onTop);
  }

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
    return placeOnGround(this.world, GAS_LANTERN_SPEC, cmd, {
      isNear: this.world.hasGasLanternNear.bind(this.world),
      spawn: this.world.spawnGasLantern.bind(this.world),
    });
  }

  switch(id: GasLanternId, tick: number): boolean {
    this.switches.forgetIdle(tick);
    const lit = this.world.isLit(id);
    if (lit === undefined || !this.switches.press(id, tick)) return false;
    this.world.setLit(id, !lit);
    this.world.relayLight(id, !lit);
    return true;
  }

  hit(id: GasLanternId, player: PlayerId | undefined, tick: number): boolean {
    return this.takeBack.hit(id, tick, player) === "taken";
  }
}
