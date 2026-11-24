import {
  asGasLanternId,
  type GasLanternId,
} from "../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../domain/camp/spec";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { handleHit } from "../shared/takeBackByHits";
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
  private readonly hits = new HitCounters<GasLanternId>(
    GAS_LANTERN_SPEC.recovery,
  );

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
    let taken = false;
    handleHit(this.hits, id, tick, {
      drop: () => {
        this.world.clearLight(id);
        this.world.dropItem(id, player);
      },
      remove: () => {
        this.world.removeGasLantern(id);
        taken = true;
      },
      showRemaining: (left) => {
        if (player !== undefined) this.world.showHitsLeft(player, left);
      },
    });
    return taken;
  }
}
