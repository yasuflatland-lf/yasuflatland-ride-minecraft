import {
  type Dimension,
  Direction,
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
import { type Cell, cellKey } from "../../../domain/shared/cells";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import { NAMESPACE } from "../../shared/identifiers";
import {
  LaidBlockLayer,
  readCeilingCells,
  writeCeilingCells,
} from "../../shared/laidBlockLayer";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  FURNITURE_TOP_CELLS,
  furnitureKindOf,
} from "../identifiers";

export class BedrockFurnitureWorld
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
  private block(dimension: DimensionId, cell: Cell) {
    try {
      return safeBlockAt(world.getDimension(dimension), cell);
    } catch {
      return undefined;
    }
  }
  isAir(dimension: DimensionId, cell: Cell): boolean {
    return this.block(dimension, cell)?.isAir === true;
  }
  isOwnBlock(dimension: DimensionId, cell: Cell): boolean {
    return (
      this.block(dimension, cell)?.typeId.startsWith(`${NAMESPACE}:`) === true
    );
  }
  isSolidTop(dimension: DimensionId, cell: Cell): boolean {
    try {
      // Stable 2.x has no solidity flag; a non-passable ray must meet the top at full height.
      // A ray that ends exactly on the face misses it on BDS, so it starts half a block above.
      const hit = world.getDimension(dimension).getBlockFromRay(
        { x: cell.x + 0.5, y: cell.y + 1.5, z: cell.z + 0.5 },
        { x: 0, y: -1, z: 0 },
        {
          maxDistance: 1,
          includeLiquidBlocks: false,
          includePassableBlocks: false,
        },
      );
      return (
        hit?.face === Direction.Up &&
        // The engine reports faceLocation.y inverted, so a full top reads 0 (ADR 0111).
        hit.faceLocation.y === 0 &&
        cellKey(hit.block.location) === cellKey(cell)
      );
    } catch {
      return false;
    }
  }
  isVehicleSpace(dimension: DimensionId, cell: Cell): boolean {
    return this.deps.isVehicleSpace(dimension, cell);
  }
  isCampSpace(dimension: DimensionId, cell: Cell): boolean {
    return this.deps.isCampSpace(dimension, cell);
  }
  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
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
    if (this.block(dimension, cell)?.typeId !== DINING_TABLE_TOP)
      return undefined;
    for (const [id, record] of this.tops) {
      if (
        record.dimension.id === dimension &&
        record.cells.some((at) => cellKey(at) === cellKey(cell))
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
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: `yasu_ride.furniture.${message}`,
      with: withArgs,
    });
  }
}
