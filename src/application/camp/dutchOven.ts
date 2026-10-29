import {
  type DutchOvenId,
  hostSpotPoint,
  isSimmering,
} from "../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../domain/camp/firePit";
import { decodeHost, encodeHost, type Host } from "../../domain/camp/hosted";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPOTS,
  FIRE_PIT_TOP_PX,
} from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { canUseBlockTop, hasClearance, placeOnGround } from "./groundPlacement";
import {
  placeOnTableTop,
  type TableTopOutcome,
  type TableTopRequest,
} from "./placeOnTableTop";
import type { DutchOvenWorld } from "./ports/dutchOven";
import type { HostedItemKind } from "./ports/tableTop";

const RULE = {
  hits: DUTCH_OVEN_SPEC.hitsToTakeBack,
  resetTicks: DUTCH_OVEN_SPEC.hitResetTicks,
};

const ON_TABLE: HostedItemKind = {
  id: "dutch_oven",
  footprint: DUTCH_OVEN_FOOTPRINT_PX,
  clearance: DUTCH_OVEN_SPEC.clearance,
};

export class DutchOvenActions {
  private readonly hits = new HitCounters<DutchOvenId>(RULE);

  constructor(private readonly world: DutchOvenWorld) {}

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
    const cell = {
      x: Math.floor(pit.at.x),
      y: Math.floor(pit.at.y),
      z: Math.floor(pit.at.z),
    };
    if (
      !hasClearance(this.world, pit.dimension, cell, DUTCH_OVEN_SPEC.clearance)
    )
      return false;
    if (!this.takeItem(cmd.player, cmd.slot)) return false;
    const [spot] = FIRE_PIT_SPOTS;
    this.spawnHosted(pit, hostSpotPoint(pit, spot, FIRE_PIT_TOP_PX), {
      kind: "fire_pit",
      id: cmd.pit,
      spot: 0,
    });
    this.world.setCovered(cmd.pit, true);
    return true;
  }

  placeOnTable(cmd: TableTopRequest): TableTopOutcome {
    return placeOnTableTop(this.world, ON_TABLE, cmd);
  }

  /** A missing player is the server test hook, which pays nothing. */
  private takeItem(player: PlayerId | undefined, slot: number): boolean {
    return (
      !player ||
      this.world.isCreative(player) ||
      this.world.consumeItem(player, slot)
    );
  }

  private spawnHosted(
    hostEntity: { dimension: DimensionId; yaw: number },
    at: Vec3,
    host: Host,
  ): void {
    const oven = this.world.spawnDutchOven(
      hostEntity.dimension,
      at,
      hostEntity.yaw,
    );
    this.world.setHost(oven, encodeHost(host), isSimmering(host));
  }

  checkHosts(): void {
    const occupiedPits = new Set<string>();
    for (const oven of this.world.loadedOvens()) {
      const host = decodeHost(this.world.host(oven));
      if (host.kind === "ground") continue;
      if (
        this.world.isHostAreaLoaded(oven) &&
        !this.world.hostExists(host.id)
      ) {
        this.world.setHost(oven, "", false);
        continue;
      }
      if (host.kind === "fire_pit") occupiedPits.add(host.id);
    }
    for (const pit of this.world.loadedFirePits()) {
      if (this.world.isCovered(pit) && !occupiedPits.has(pit))
        this.world.setCovered(pit, false);
    }
  }

  hit(id: DutchOvenId, player: PlayerId, tick: number): boolean {
    const result = this.hits.hit(id, tick, false);
    if (result.broken) {
      const host = decodeHost(this.world.host(id));
      if (host.kind === "fire_pit" && this.world.hostExists(host.id))
        this.world.setCovered(asFirePitId(host.id), false);
      this.world.dropItem(id);
      this.world.removeDutchOven(id);
      return true;
    }
    this.world.showHitsLeft(player, result.hitsLeft);
    return false;
  }
}
