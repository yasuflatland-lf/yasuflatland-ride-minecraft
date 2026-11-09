import {
  asGasLanternId,
  type GasLanternId,
} from "../../domain/camp/gasLantern";
import {
  CAMP_TABLE_TOP,
  GAS_LANTERN_FOOTPRINT_PX,
  GAS_LANTERN_SPEC,
  TABLE_SPOTS,
} from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import { HitCounters } from "../../domain/shared/hitCounter";
import { decodeHost } from "../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { SwitchCooldowns } from "../../domain/shared/switchCooldown";
import type { LocalPoint } from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import { placeOnTop, type TopOutcome } from "../shared/placeOnTop";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { handleHit } from "../shared/takeBackByHits";
import type { GasLanternWorld } from "./ports/gasLantern";

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
 * A removal clears the light block before the entity goes so no light is left
 * behind (ADR 0185).
 */
export function gasLanternHostedKind(world: GasLanternWorld): HostedKindPort {
  return {
    loaded: () => world.loadedGasLanterns(),
    host: (id) =>
      decodeHost(world.host(asGasLanternId(id)), (type, spot) =>
        type === "camp_table" ? TABLE_SPOTS[spot] : undefined,
      ),
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

  placeOnTable(cmd: {
    player?: PlayerId;
    table: TableId;
    slot: number;
    aim?: LocalPoint;
  }): TopOutcome {
    return placeOnTop(this.world, CAMP_TABLE_TOP, ON_TABLE, {
      ...cmd,
      hostType: "camp_table",
      host: cmd.table,
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
    let taken = false;
    handleHit(this.hits, id, tick, {
      drop: () => {
        this.world.clearLight(id);
        this.world.dropItem(id);
      },
      remove: () => {
        this.world.removeGasLantern(id);
        taken = true;
      },
      showRemaining: (left) => this.world.showHitsLeft(player, left),
    });
    return taken;
  }
}
