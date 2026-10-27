import {
  type DutchOvenId,
  decodeHost,
  encodeHost,
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
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../domain/shared/hitCounter";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { degToRad, type Vec3 } from "../../domain/shared/vec";
import type { DutchOvenWorld } from "./ports/dutchOven";

export class DutchOvenActions {
  private readonly counters = new Map<DutchOvenId, HitCounter>();

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
    for (let dy = 1; dy <= DUTCH_OVEN_SPEC.clearance; dy++) {
      const at = { ...block, y: block.y + dy };
      if (
        !this.world.isAir(dimension, at) ||
        this.world.isVehicleSpace(dimension, at)
      )
        return false;
    }
    const at = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
    if (this.world.hasDutchOvenNear(dimension, at)) return false;
    if (!this.world.isCreative(player) && !this.world.consumeItem(player, slot))
      return false;
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
    for (let dy = 0; dy < DUTCH_OVEN_SPEC.clearance; dy++) {
      const at = { ...cell, y: cell.y + dy };
      if (
        !this.world.isAir(pit.dimension, at) ||
        this.world.isVehicleSpace(pit.dimension, at)
      )
        return false;
    }
    if (
      cmd.player &&
      !this.world.isCreative(cmd.player) &&
      !this.world.consumeItem(cmd.player, cmd.slot)
    )
      return false;
    const [spot] = FIRE_PIT_SPOTS;
    const angle = degToRad(pit.yaw);
    const at = {
      x: pit.at.x + (spot.x * Math.cos(angle) - spot.z * Math.sin(angle)) / 16,
      y: pit.at.y + FIRE_PIT_TOP_PX / 16,
      z: pit.at.z + (spot.x * Math.sin(angle) + spot.z * Math.cos(angle)) / 16,
    };
    const oven = this.world.spawnDutchOven(pit.dimension, at, pit.yaw);
    const host: OvenHost = { kind: "fire_pit", id: cmd.pit, spot: 0 };
    this.world.setHost(oven, encodeHost(host), isSimmering(host));
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
    const angle = degToRad(table.yaw);
    const at = {
      x:
        table.at.x + (spot.x * Math.cos(angle) - spot.z * Math.sin(angle)) / 16,
      y: table.at.y + TABLE_TOP_PX / 16,
      z:
        table.at.z + (spot.x * Math.sin(angle) + spot.z * Math.cos(angle)) / 16,
    };
    for (let dy = 0; dy < DUTCH_OVEN_SPEC.clearance; dy++) {
      const cell = {
        x: Math.floor(at.x),
        y: Math.floor(table.at.y) + dy,
        z: Math.floor(at.z),
      };
      if (
        !this.world.isAir(table.dimension, cell) ||
        this.world.isVehicleSpace(table.dimension, cell)
      )
        return false;
    }
    if (
      cmd.player &&
      !this.world.isCreative(cmd.player) &&
      !this.world.consumeItem(cmd.player, cmd.slot)
    )
      return false;
    const oven = this.world.spawnDutchOven(table.dimension, at, table.yaw);
    const host: OvenHost = { kind: "camp_table", id: cmd.table, spot: index };
    this.world.setHost(oven, encodeHost(host), isSimmering(host));
    return true;
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
    const result = registerHit(
      this.counters.get(id) ?? EMPTY_COUNTER,
      tick,
      false,
      {
        hits: DUTCH_OVEN_SPEC.hitsToTakeBack,
        resetTicks: DUTCH_OVEN_SPEC.hitResetTicks,
      },
    );
    if (result.broken) {
      this.counters.delete(id);
      const host = decodeHost(this.world.host(id));
      if (host.kind === "fire_pit" && this.world.hostExists(host.id))
        this.world.setCovered(asFirePitId(host.id), false);
      this.world.dropItem(id);
      this.world.removeDutchOven(id);
      return true;
    }
    this.counters.set(id, result.counter);
    this.world.showHitsLeft(
      player,
      DUTCH_OVEN_SPEC.hitsToTakeBack - result.counter.count,
    );
    return false;
  }
}
