import {
  asDutchOvenId,
  type DutchOvenId,
  initialSimmering,
} from "../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../domain/camp/firePit";
import {
  CAMP_TABLE_TOP,
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPOTS,
  FIRE_PIT_TOP_PX,
  TABLE_SPOTS,
} from "../../domain/camp/spec";
import type { TableId } from "../../domain/camp/table";
import { cellOf } from "../../domain/shared/cells";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import { HitCounters } from "../../domain/shared/hitCounter";
import { decodeHost, encodeHost, type Host } from "../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import {
  hostSpotPoint,
  type LocalPoint,
  type TopSurface,
} from "../../domain/shared/tableTop";
import type { Vec3 } from "../../domain/shared/vec";
import {
  canUseBlockTop,
  hasClearance,
  placeOnGround,
} from "../shared/groundPlacement";
import { placePaid } from "../shared/paidPlacement";
import {
  placeOnTop,
  type TopOutcome,
  type TopRequest,
} from "../shared/placeOnTop";
import type { HostedItemKind } from "../shared/ports/hostedItem";
import type { HostedKindPort } from "../shared/ports/hostedKind";
import { handleHit } from "../shared/takeBackByHits";
import type { DutchOvenWorld } from "./ports/dutchOven";

const ON_TABLE: HostedItemKind = {
  id: "dutch_oven",
  footprint: DUTCH_OVEN_FOOTPRINT_PX,
  clearance: DUTCH_OVEN_SPEC.clearance,
};

/** The oven as a kind the hosted items guard removes when its host is gone. */
export function dutchOvenHostedKind(world: DutchOvenWorld): HostedKindPort {
  return {
    loaded: () => world.loadedOvens(),
    host: (id) =>
      decodeHost(world.host(asDutchOvenId(id)), (type, spot) =>
        type === "camp_table" ? TABLE_SPOTS[spot] : undefined,
      ),
    isHostAreaLoaded: (id) => world.isHostAreaLoaded(asDutchOvenId(id)),
    hostExists: (hostId) => world.hostExists(hostId),
    remove: (id) => world.removeDutchOven(asDutchOvenId(id)),
  };
}

export class DutchOvenActions {
  private readonly hits = new HitCounters<DutchOvenId>(
    DUTCH_OVEN_SPEC.recovery,
  );

  private readonly switches = new Debounces<DutchOvenId>(
    LIGHT_SWITCH_COOLDOWN_TICKS,
  );

  constructor(private readonly world: DutchOvenWorld) {}

  toggleLid(id: DutchOvenId, tick: number): boolean {
    this.switches.forgetIdle(tick);
    const simmering = this.world.simmering(id);
    if (simmering === undefined || !this.switches.press(id, tick)) return false;
    this.world.setSimmering(id, !simmering);
    return true;
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
    return placeOnGround(this.world, DUTCH_OVEN_SPEC, cmd, {
      isNear: this.world.hasDutchOvenNear.bind(this.world),
      spawn: this.world.spawnDutchOven.bind(this.world),
    });
  }

  placeOnFirePit(cmd: {
    /** Omitted only by the server test hook, as for tent placement (ADR 0010). */
    player?: PlayerId;
    pit: FirePitId;
    slot: number;
  }): boolean {
    const pit = this.world.firePit(cmd.pit);
    if (!pit || this.world.isCovered(cmd.pit)) return false;
    const cell = cellOf(pit.at);
    if (
      !hasClearance(this.world, pit.dimension, cell, DUTCH_OVEN_SPEC.clearance)
    )
      return false;
    const [spot] = FIRE_PIT_SPOTS;
    const result = placePaid(
      this.world,
      { player: cmd.player, slot: cmd.slot },
      () =>
        this.spawnHosted(pit, hostSpotPoint(pit, spot, FIRE_PIT_TOP_PX), {
          kind: "spot",
          hostType: "fire_pit",
          id: cmd.pit,
          spot: 0,
        }),
    );
    if (result.placed) this.world.setCovered(cmd.pit, true);
    return result.placed;
  }

  placeOnTop(surface: TopSurface, cmd: TopRequest): TopOutcome {
    return placeOnTop(this.world, surface, ON_TABLE, cmd);
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

  private spawnHosted(
    hostEntity: { dimension: DimensionId; yaw: number },
    at: Vec3,
    host: Host,
  ): DutchOvenId | undefined {
    const marker = encodeHost(host);
    const simmering = initialSimmering(host);
    return this.world.spawnDutchOven(
      hostEntity.dimension,
      at,
      hostEntity.yaw,
      (oven) => this.world.setHost(oven, marker, simmering),
    );
  }

  /** Clears the covered flag of every loaded Fire Pit no oven stands on. */
  uncoverEmptyFirePits(): void {
    const occupiedPits = new Set<string>();
    for (const oven of this.world.loadedOvens()) {
      const host = decodeHost(this.world.host(oven));
      if (host.kind === "spot" && host.hostType === "fire_pit")
        occupiedPits.add(host.id);
    }
    for (const pit of this.world.loadedFirePits()) {
      if (this.world.isCovered(pit) && !occupiedPits.has(pit))
        this.world.setCovered(pit, false);
    }
  }

  hit(id: DutchOvenId, player: PlayerId | undefined, tick: number): boolean {
    let taken = false;
    handleHit(this.hits, id, tick, {
      drop: () => {
        const host = decodeHost(this.world.host(id));
        if (
          host.kind === "spot" &&
          host.hostType === "fire_pit" &&
          this.world.hostExists(host.id)
        )
          this.world.setCovered(asFirePitId(host.id), false);
        this.world.dropItem(id);
      },
      remove: () => {
        this.world.removeDutchOven(id);
        taken = true;
      },
      showRemaining: (left) => {
        if (player !== undefined) this.world.showHitsLeft(player, left);
      },
    });
    return taken;
  }
}
