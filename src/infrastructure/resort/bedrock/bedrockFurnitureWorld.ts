import {
  type Dimension,
  type Entity,
  ItemStack,
  world,
} from "@minecraft/server";
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
import { blockIn, isSolidTop, safeBlockAt } from "../../shared/blocks";
import { BedrockGroundCells } from "../../shared/groundCells";
import {
  LaidBlockLayer,
  readCeilingCells,
  writeCeilingCells,
} from "../../shared/laidBlockLayer";
import {
  consumeHeld,
  giveOrDrop,
  playerById,
  showActionBar,
} from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  FURNITURE_TOP_CELLS,
  furnitureKindOf,
} from "../identifiers";

// A block spans 16 px on each horizontal axis.
const CELL_FOOTPRINT_PX = { halfX: 8, halfZ: 8 };

export class BedrockFurnitureWorld
  extends BedrockGroundCells
  implements FurnitureWorld, FurnitureTakeBackWorld, FurnitureTopBlocksWorld
{
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

    this.layer = new LaidBlockLayer(
      DINING_TABLE_TOP,
      deps.isVehicleSpace,
      "furniture top",
    );
  }
  entity(id: FurnitureId): Entity | undefined {
    try {
      const entity = world.getEntity(id);
      return entity?.isValid &&
        furnitureKindOf(entity.typeId, "entity") !== undefined
        ? entity
        : undefined;
    } catch {
      return undefined;
    }
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
    this.show(player, reason === "occupied" ? "occupied" : "something_on_top");
  }
  isSolidTop(dimension: DimensionId, cell: Cell): boolean {
    return isSolidTop(dimension, cell);
  }
  isCampSpace(dimension: DimensionId, cell: Cell): boolean {
    return this.deps.isCampSpace(dimension, cell);
  }
  consumeItem(player: PlayerId, kind: FurnitureKind, slot: number): boolean {
    const entity = playerById(player);
    return (
      entity !== undefined &&
      consumeHeld(entity, FURNITURE_IDS[kind].item, slot)
    );
  }
  refund(player: PlayerId, kind: FurnitureKind, _slot: number): void {
    const entity = playerById(player);
    if (entity)
      giveOrDrop(entity, [new ItemStack(FURNITURE_IDS[kind].item, 1)]);
  }
  spawn(dimension: DimensionId, pose: FurniturePose): FurnitureId | undefined {
    let entity: Entity | undefined;
    try {
      entity = world
        .getDimension(dimension)
        .spawnEntity(FURNITURE_IDS[pose.kind].entity, pose.origin);
      entity.setRotation({ x: 0, y: pose.yaw });
      return asFurnitureId(entity.id);
    } catch {
      try {
        entity?.remove();
      } catch {
        // A chunk can unload between a failed spawn setter and its rollback.
      }
      return undefined;
    }
  }
  remember(entity: Entity): { dimension: Dimension; cells: Cell[] } {
    const id = asFurnitureId(entity.id);
    let record = this.tops.get(id);
    if (!record) {
      record = {
        dimension: entity.dimension,
        cells: readCeilingCells(entity.getDynamicProperty(FURNITURE_TOP_CELLS)),
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
        writeCeilingCells(record.cells),
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
        writeCeilingCells(record.cells),
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
    return diningTableTopCells({
      kind,
      origin: entity.location,
      yaw: snapYaw4(entity.getRotation().y),
    });
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
        readCeilingCells(entity.getDynamicProperty(FURNITURE_TOP_CELLS))),
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
    const receiver = playerById(player);
    const kind = this.kindOf(id);
    if (kind === undefined) return;
    const item = new ItemStack(FURNITURE_IDS[kind].item, 1);
    if (receiver) giveOrDrop(receiver, [item]);
    else entity.dimension.spawnItem(item, entity.location);
  }
  remove(id: FurnitureId): void {
    this.entity(id)?.remove();
  }
  showBlocked(player: PlayerId): void {
    this.show(player, "blocked");
  }
  showHitsLeft(player: PlayerId, left: number): void {
    this.show(player, "hits_left", [String(left)]);
  }
  showTaken(player: PlayerId): void {
    this.show(player, "taken");
  }
  private show(
    player: PlayerId,
    message: string,
    withArgs: string[] = [],
  ): void {
    showActionBar(player, {
      translate: `yasu_ride.furniture.${message}`,
      with: withArgs,
    });
  }
}
