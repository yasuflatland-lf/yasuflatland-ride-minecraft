import type { Dimension, Entity } from "@minecraft/server";
import type { FurnitureTopBlocksWorld } from "../../../application/resort/ports/furnitureTopBlocks";
import type {
  FurnitureTakeBackWorld,
  FurnitureWorld,
} from "../../../application/resort/ports/furnitureWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import {
  diningTableTopCells,
  FURNITURE_SPEC,
  type FurnitureKind,
  type FurniturePose,
  furniturePoseAt,
} from "../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../domain/resort/ids";
import {
  type Cell,
  cellCenter,
  cellKey,
  sameCell,
} from "../../../domain/shared/cells";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import {
  hostLocalPx,
  type LocalPoint,
  overlaps,
  type TopRect,
} from "../../../domain/shared/tableTop";
import { blockIn, safeBlockAt } from "../../shared/blocks";
import {
  gearEntities,
  gearFeedback,
  gearGroundChecks,
  giveBack,
  giveBackReceiver,
  spawnIn,
} from "../../shared/gearEntity";
import { BedrockGroundCells } from "../../shared/groundCells";
import {
  LaidBlockLayer,
  readSavedCells,
  writeSavedCells,
} from "../../shared/laidBlockLayer";
import { consumeHeld, playerById } from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  FURNITURE_TOP_CELLS,
  furnitureKindOf,
} from "../identifiers";
import { resortGearCells } from "./resortGearCells";

// A block spans 16 px on each horizontal axis.
const CELL_FOOTPRINT_PX = { halfX: 8, halfZ: 8 };
const entities = gearEntities<FurnitureId>({
  has: (typeId) => furnitureKindOf(typeId, "entity") !== undefined,
});
const feedback = gearFeedback("furniture");

export class BedrockFurnitureWorld
  extends BedrockGroundCells
  implements FurnitureWorld, FurnitureTakeBackWorld, FurnitureTopBlocksWorld
{
  entity = entities.entity;
  remove = entities.remove;
  showBlocked = feedback.showBlocked;
  showHitsLeft = feedback.showHitsLeft;
  showTaken = feedback.showTaken;
  readonly isSolidTop: SpaceCheck;
  readonly isCampSpace: SpaceCheck;

  private readonly layer: LaidBlockLayer;
  private readonly tops = new Map<
    FurnitureId,
    { dimension: Dimension; cells: Cell[] }
  >();
  constructor(
    private readonly deps: {
      topHosts: TopHostRegistry;
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {
    super((dimension, cell) => deps.isVehicleSpace(dimension, cell));
    ({ isSolidTop: this.isSolidTop, isCampSpace: this.isCampSpace } =
      gearGroundChecks(deps));

    this.layer = new LaidBlockLayer(
      DINING_TABLE_TOP,
      deps.isVehicleSpace,
      "furniture top",
    );
  }
  kindOf(id: FurnitureId): FurnitureKind | undefined {
    const entity = this.entity(id);
    return entity ? furnitureKindOf(entity.typeId, "entity") : undefined;
  }
  isOccupied(id: FurnitureId): boolean {
    return (
      (this.entity(id)?.getComponent("minecraft:rideable")?.getRiders()
        .length ?? 0) > 0
    );
  }
  somethingOnTop(id: FurnitureId): boolean {
    const entity = this.entity(id);
    const host = entity && this.deps.topHosts.hostTypeOf(entity);
    return (
      host !== undefined &&
      this.deps.topHosts.itemsOnTop(host.hostType, id).length > 0
    );
  }
  showRefused(player: PlayerId, reason: "occupied" | "somethingOnTop"): void {
    feedback.showRefused(
      player,
      reason === "occupied" ? "occupied" : "something_on_top",
      [],
    );
  }
  resortGearCells = resortGearCells;
  consumeItem(player: PlayerId, kind: FurnitureKind, slot: number): boolean {
    const entity = playerById(player);
    return (
      entity !== undefined &&
      consumeHeld(entity, FURNITURE_IDS[kind].item, slot)
    );
  }
  refund(player: PlayerId, kind: FurnitureKind, _slot: number): void {
    const entity = playerById(player);
    if (entity) giveBack(entity, FURNITURE_IDS[kind].item, entity);
  }
  spawn(dimension: DimensionId, pose: FurniturePose): FurnitureId | undefined {
    const entity = spawnIn(
      dimension,
      FURNITURE_IDS[pose.kind].entity,
      pose.origin,
      pose.yaw,
    );
    return entity && asFurnitureId(entity.id);
  }
  remember(entity: Entity): { dimension: Dimension; cells: Cell[] } {
    const id = asFurnitureId(entity.id);
    let record = this.tops.get(id);
    if (!record) {
      record = {
        dimension: entity.dimension,
        cells: readSavedCells(entity.getDynamicProperty(FURNITURE_TOP_CELLS)),
      };
      this.tops.set(id, record);
    }
    return record;
  }
  layTop(id: FurnitureId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const warn = this.layer.warning("lay");
    try {
      const wanted = this.topCells(entity);
      if (wanted.length === 0) return;
      const record = this.remember(entity);
      const keys = new Set(wanted.map(cellKey));
      const stale = record.cells.filter((cell) => !keys.has(cellKey(cell)));
      this.layer.clear(record.dimension, stale, warn);
      record.cells = record.cells.filter(
        (cell) =>
          keys.has(cellKey(cell)) ||
          safeBlockAt(record.dimension, cell) === undefined ||
          safeBlockAt(record.dimension, cell)?.typeId === DINING_TABLE_TOP,
      );
      record.cells = this.layer.lay(
        record.dimension,
        wanted,
        record.cells,
        warn,
      );
      entity.setDynamicProperty(
        FURNITURE_TOP_CELLS,
        writeSavedCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
  }
  clearTop(id: FurnitureId): boolean {
    const entity = this.entity(id);
    const record =
      this.tops.get(id) ?? (entity ? this.remember(entity) : undefined);
    if (!record) return true;
    const warn = this.layer.warning("clear");
    this.layer.clear(record.dimension, record.cells, warn);
    // Keep unloaded cells for later cleanup rather than losing their only record.
    record.cells = record.cells.filter(
      (cell) =>
        safeBlockAt(record.dimension, cell) === undefined ||
        safeBlockAt(record.dimension, cell)?.typeId === DINING_TABLE_TOP,
    );
    try {
      entity?.setDynamicProperty(
        FURNITURE_TOP_CELLS,
        writeSavedCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
    if (record.cells.length === 0) this.tops.delete(id);
    return record.cells.length === 0;
  }
  ownerAt(dimension: DimensionId, cell: Cell): FurnitureId | undefined {
    if (blockIn(dimension, cell)?.typeId !== DINING_TABLE_TOP) return undefined;
    for (const [id, record] of this.tops) {
      if (
        record.dimension.id === dimension &&
        record.cells.some((at) => sameCell(at, cell))
      )
        return id;
    }
    return undefined;
  }
  private topCells(entity: Entity): Cell[] {
    const kind = furnitureKindOf(entity.typeId, "entity");
    if (kind === undefined || !FURNITURE_SPEC[kind].top) return [];
    return diningTableTopCells(
      furniturePoseAt(kind, entity.location, snapYaw4(entity.getRotation().y)),
    );
  }
  private cellOverlaps(
    entity: Entity,
    cell: Cell,
    at: LocalPoint,
    footprint: TopRect,
  ): boolean {
    const centre = hostLocalPx(
      { at: entity.location, yaw: entity.getRotation().y },
      cellCenter(cell),
    );
    return overlaps(
      { at, footprint },
      { at: centre, footprint: CELL_FOOTPRINT_PX },
    );
  }
  blockedAt(entity: Entity, at: LocalPoint, footprint: TopRect): boolean {
    return this.topCells(entity).some(
      (cell) =>
        this.cellOverlaps(entity, cell, at, footprint) &&
        safeBlockAt(entity.dimension, { ...cell, y: cell.y + 1 })?.isAir !==
          true,
    );
  }
  hostedAbove(dimension: DimensionId, destination: Cell): boolean {
    const cell = { ...destination, y: destination.y - 1 };
    const id = this.ownerAt(dimension, cell);
    const entity = id && this.entity(id);
    const host = entity && this.deps.topHosts.hostTypeOf(entity);
    return !!(
      entity &&
      host &&
      this.deps.topHosts
        .itemsOnTop(host.hostType, entity.id)
        .some((item) =>
          this.cellOverlaps(entity, cell, item.at, item.footprint),
        )
    );
  }
  blockAboveTop(id: FurnitureId): boolean {
    const entity = this.entity(id);
    if (!entity) return false;
    const cells = [
      ...this.topCells(entity),
      ...(this.tops.get(id)?.cells ??
        readSavedCells(entity.getDynamicProperty(FURNITURE_TOP_CELLS))),
    ];
    return cells.some(
      (cell) =>
        safeBlockAt(entity.dimension, { ...cell, y: cell.y + 1 })?.isAir !==
        true,
    );
  }
  dropItem(id: FurnitureId, player: PlayerId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const kind = this.kindOf(id);
    if (kind === undefined) return;
    const receiver = giveBackReceiver(FURNITURE_SPEC[kind].giveBack, player);
    giveBack(entity, FURNITURE_IDS[kind].item, receiver);
  }
}
