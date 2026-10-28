import {
  type DutchOvenId,
  decodeHost,
  encodeHost,
  hostSpotPoint,
  isSimmering,
  nearestFreeSpot,
  type OvenHost,
} from "../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../domain/camp/firePit";
import {
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPOTS,
  FIRE_PIT_TOP_PX,
  TABLE_SPOTS,
  TABLE_TOP_PX,
} from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { DutchOvenWorld } from "./ports/dutchOven";

const RULE = {
  hits: DUTCH_OVEN_SPEC.hitsToTakeBack,
  resetTicks: DUTCH_OVEN_SPEC.hitResetTicks,
};

export class DutchOvenActions {
  private readonly hits = new HitCounters<DutchOvenId>(RULE);

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
    if (!this.hasClearance(dimension, { ...block, y: block.y + 1 }))
      return false;
    const at = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
    if (this.world.hasDutchOvenNear(dimension, at)) return false;
    if (!this.takeItem(player, slot)) return false;
    this.world.spawnDutchOven(dimension, at, Math.round(yaw / 90) * 90);
    return true;
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
    if (!this.hasClearance(pit.dimension, cell)) return false;
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

  placeOnTable(cmd: {
    /** Omitted only by the server test hook (ADR 0010). */
    player?: PlayerId;
    table: string;
    slot: number;
    aim?: { x: number; z: number };
  }): boolean {
    const table = this.world.table(cmd.table);
    if (!table) return false;
    const index = nearestFreeSpot(
      TABLE_SPOTS,
      this.world.takenTableSpots(cmd.table),
      cmd.aim ?? { x: 0, z: 0 },
    );
    if (index === undefined) return false;
    const spot = TABLE_SPOTS[index];
    if (!spot) return false;
    const at = hostSpotPoint(table, spot, TABLE_TOP_PX);
    const cell = {
      x: Math.floor(at.x),
      y: Math.floor(table.at.y),
      z: Math.floor(at.z),
    };
    if (!this.hasClearance(table.dimension, cell)) return false;
    if (!this.takeItem(cmd.player, cmd.slot)) return false;
    this.spawnHosted(table, at, {
      kind: "camp_table",
      id: cmd.table,
      spot: index,
    });
    return true;
  }

  private hasClearance(dimension: DimensionId, base: Vec3): boolean {
    for (let dy = 0; dy < DUTCH_OVEN_SPEC.clearance; dy++) {
      const cell = { ...base, y: base.y + dy };
      if (
        !this.world.isAir(dimension, cell) ||
        this.world.isVehicleSpace(dimension, cell)
      )
        return false;
    }
    return true;
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
    host: OvenHost,
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
