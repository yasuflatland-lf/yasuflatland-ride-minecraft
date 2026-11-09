import { Direction, type Entity, ItemStack, world } from "@minecraft/server";
import type {
  FurnitureTakeBackWorld,
  FurnitureWorld,
} from "../../../application/resort/ports/furnitureWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type {
  FurnitureKind,
  FurniturePose,
} from "../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../domain/resort/ids";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import { NAMESPACE } from "../../shared/identifiers";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import { FURNITURE_IDS, furnitureKindOf } from "../identifiers";

export class BedrockFurnitureWorld
  implements FurnitureWorld, FurnitureTakeBackWorld
{
  constructor(
    private readonly deps: {
      topHosts: TopHostRegistry;
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {}
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
