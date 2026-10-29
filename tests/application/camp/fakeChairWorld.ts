import type { ChairWorld } from "../../../src/application/camp/ports/chair";
import type { ChairId, ChairKindId } from "../../../src/domain/camp/chair";
import type { DimensionId, PlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";

const key = (at: Vec3) => `${at.x},${at.y},${at.z}`;

/** An in-memory ChairWorld: every cell is air unless listed in `solid`. */
export class FakeChairWorld implements ChairWorld {
  kind: ChairKindId | undefined = "low_chair";
  kindOf(): ChairKindId | undefined {
    return this.kind;
  }
  solid = new Set<string>();
  vehicleSpace = new Set<string>();
  ownBlocks = new Set<string>();
  chairs = new Set<string>();
  creative = false;
  consumeResult = true;
  occupied = new Set<ChairId>();
  readonly consumed: { kind: ChairKindId; playerId: PlayerId; slot: number }[] =
    [];
  readonly spawned: { kind: ChairKindId; at: Vec3; yaw: number }[] = [];
  readonly removed: ChairId[] = [];
  readonly dropped: ChairId[] = [];
  readonly hints: {
    kind: ChairKindId;
    playerId: PlayerId;
    hitsLeft: number;
  }[] = [];

  isAir(_d: DimensionId, at: Vec3): boolean {
    return !this.solid.has(key(at));
  }
  isVehicleSpace(_d: DimensionId, cell: Vec3): boolean {
    return this.vehicleSpace.has(key(cell));
  }
  isOwnBlock(_d: DimensionId, at: Vec3): boolean {
    return this.ownBlocks.has(key(at));
  }
  hasChairAt(_kind: ChairKindId, _d: DimensionId, cell: Vec3): boolean {
    return this.chairs.has(key(cell));
  }
  isCreative(): boolean {
    return this.creative;
  }
  consumeChairItem(
    kind: ChairKindId,
    playerId: PlayerId,
    slot: number,
  ): boolean {
    if (this.consumeResult) this.consumed.push({ kind, playerId, slot });
    return this.consumeResult;
  }
  spawnChair(kind: ChairKindId, _d: DimensionId, at: Vec3, yaw: number): void {
    this.spawned.push({ kind, at, yaw });
  }
  isOccupied(chairId: ChairId): boolean {
    return this.occupied.has(chairId);
  }
  removeChair(chairId: ChairId): void {
    this.removed.push(chairId);
  }
  dropChairItem(chairId: ChairId): void {
    this.dropped.push(chairId);
  }
  showHitsLeft(kind: ChairKindId, playerId: PlayerId, hitsLeft: number): void {
    this.hints.push({ kind, playerId, hitsLeft });
  }
}

export { key as cellKey };
