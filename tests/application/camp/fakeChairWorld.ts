import type { ChairWorld } from "../../../src/application/camp/ports/chair";
import type { ItemPayment } from "../../../src/application/shared/ports/itemPayment";
import {
  asChairId,
  type ChairId,
  type ChairKindId,
} from "../../../src/domain/camp/chair";
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
  failSpawn = false;
  readonly refunded: { kind: ChairKindId; playerId: PlayerId; slot: number }[] =
    [];
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
  paymentFor(kind: ChairKindId): ItemPayment {
    return {
      isCreative: () => this.creative,
      consumeItem: (playerId, slot) => {
        if (this.consumeResult) this.consumed.push({ kind, playerId, slot });
        return this.consumeResult;
      },
      refund: (playerId, slot) => {
        this.refunded.push({ kind, playerId, slot });
      },
    };
  }
  spawnChair(
    kind: ChairKindId,
    _d: DimensionId,
    at: Vec3,
    yaw: number,
  ): ChairId | undefined {
    if (this.failSpawn) return undefined;
    this.spawned.push({ kind, at, yaw });
    return asChairId("chair");
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
