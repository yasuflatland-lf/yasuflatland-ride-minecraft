import {
  asGasLanternId,
  type GasLanternId,
} from "../../domain/camp/gasLantern";
import { decodeCampHost } from "../../domain/camp/hosted";
import { CAMP_TABLE_TOP, GAS_LANTERN_SPEC } from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { LocalPoint, TopSurface } from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, placeOnGround } from "../shared/groundPlacement";
import {
  placeOnTop,
  type TopOutcome,
  type TopRequest,
} from "../shared/placeOnTop";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { handleHit } from "../shared/takeBackByHits";
import type { GasLanternWorld } from "./ports/gasLantern";

/**
 * The lantern as a kind the hosted items guard removes when its host is gone.
 * A removal clears the light block before the entity goes so no light is left
 * behind (ADR 0185).
 */
export function gasLanternHostedKind(world: GasLanternWorld): HostedKindPort {
  return {
    loaded: () => world.loadedGasLanterns(),
    host: (id) => decodeCampHost(world.host(asGasLanternId(id))),
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
  private readonly hits = new HitCounters<GasLanternId>(
    GAS_LANTERN_SPEC.recovery,
  );

  private readonly switches = new Debounces<GasLanternId>(
    LIGHT_SWITCH_COOLDOWN_TICKS,
  );

  constructor(
    private readonly world: GasLanternWorld,
    private readonly onTop: HostedItemKind,
  ) {}

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

  placeOnTop(surface: TopSurface, cmd: TopRequest): TopOutcome {
    return placeOnTop(this.world, surface, this.onTop, cmd);
  }

  placeOnTable(cmd: {
    player?: PlayerId;
    table: TableId;
    slot: number;
    aim?: LocalPoint;
  }): TopOutcome {
    return this.placeOnTop(CAMP_TABLE_TOP, {
      ...cmd,
      hostType: "camp_table",
      host: cmd.table,
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
        this.world.dropItem(id);
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
