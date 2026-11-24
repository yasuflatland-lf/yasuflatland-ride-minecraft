import type { Entity } from "@minecraft/server";
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
import { CELL_FOOTPRINT_PX } from "../../../domain/resort/spec";
import { type Cell, cellCenter } from "../../../domain/shared/cells";
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
import { SingleBlockLayer } from "../../shared/laidBlockLayer";
import { consumeHeld, playerById } from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  FURNITURE_TOP_CELLS,
  furnitureKindOf,
} from "../identifiers";
import { resortGearCells } from "./resortGearCells";

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

  private readonly layer: SingleBlockLayer<FurnitureId>;
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

    this.layer = new SingleBlockLayer(
      DINING_TABLE_TOP,
      FURNITURE_TOP_CELLS,
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
  remember(entity: Entity): void {
    this.layer.remember(asFurnitureId(entity.id), entity);
  }
  layTop(id: FurnitureId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const warn = this.layer.warning("lay");
    try {
      const wanted = this.topCells(entity);
      if (wanted.length > 0) this.layer.lay(id, entity, wanted, warn);
    } catch (error) {
      warn(error);
    }
  }
  clearTop(id: FurnitureId): boolean {
    return this.layer.clear(id, this.entity(id)).length === 0;
  }
  ownerAt(
    dimension: DimensionId,
    cell: Cell,
    typeId = blockIn(dimension, cell)?.typeId,
  ): FurnitureId | undefined {
    return typeId === undefined
      ? undefined
      : this.layer.ownerOf(dimension, cell, typeId);
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
      ...this.layer.heldCells(id, entity),
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
