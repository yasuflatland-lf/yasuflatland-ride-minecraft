import {
  asGasLanternId,
  type GasLanternId,
} from "../../domain/camp/gasLantern";
import { decodeHost } from "../../domain/camp/hosted";
import {
  GAS_LANTERN_FOOTPRINT_PX,
  GAS_LANTERN_SPEC,
} from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { SwitchCooldowns } from "../../domain/shared/switchCooldown";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "./groundPlacement";
import {
  placeOnTableTop,
  type TableTopOutcome,
  type TableTopRequest,
} from "./placeOnTableTop";
import type { GasLanternWorld } from "./ports/gasLantern";
import type { HostedKindPort } from "./ports/hostedKind";
import type { HostedItemKind } from "./ports/tableTop";

const RULE = {
  hits: GAS_LANTERN_SPEC.hitsToTakeBack,
  resetTicks: GAS_LANTERN_SPEC.hitResetTicks,
};

const ON_TABLE: HostedItemKind = {
  id: "gas_lantern",
  footprint: GAS_LANTERN_FOOTPRINT_PX,
  clearance: GAS_LANTERN_SPEC.tableClearance,
};

/**
 * The lantern as a kind the hosted items guard removes when its host is gone.
 * A ground lantern is never listed, and a removal clears the light block
 * before the entity goes so no light is left behind (ADR 0185).
 */
export function gasLanternHostedKind(world: GasLanternWorld): HostedKindPort {
  return {
    loaded: () =>
      world
        .loadedGasLanterns()
        .filter((id) => decodeHost(world.host(id)).kind !== "ground"),
    host: (id) => decodeHost(world.host(asGasLanternId(id))),
    isHostAreaLoaded: (id) => world.isHostAreaLoaded(asGasLanternId(id)),
    hostExists: (hostId) => world.hostExists(hostId),
    remove: (id) => {
      const lantern = asGasLanternId(id);
      world.clearLight(lantern);
      world.removeGasLantern(lantern);
    },
  };
}

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

  placeOnTable(cmd: TableTopRequest): TableTopOutcome {
    return placeOnTableTop(this.world, ON_TABLE, cmd);
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
