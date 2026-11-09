import { Direction, type Entity, ItemStack, world } from "@minecraft/server";
import type { BeachChairFormWorld } from "../../../application/resort/ports/beachChairForm";
import type { BeachChairRiderWorld } from "../../../application/resort/ports/beachChairRider";
import type {
  BeachChairTakeBackWorld,
  BeachChairWorld,
} from "../../../application/resort/ports/beachChairWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import {
  type BeachChairPose,
  beachChairOrigin,
  beachChairPoseAt,
  type ChairForm,
  type ChairState,
} from "../../../domain/resort/beachChair";
import { beachChairExit } from "../../../domain/resort/beachChairExit";
import { asBeachChairId, type BeachChairId } from "../../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../domain/resort/spec";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../domain/shared/decorations";
import { snapYaw4 } from "../../../domain/shared/facing";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { forward, rightOf } from "../../../domain/shared/vec";
import { safeBlockAt } from "../../shared/blocks";
import { entityOfType } from "../../shared/entities";
import { NAMESPACE } from "../../shared/identifiers";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLD_EVENT,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  BEACH_CHAIR_LOUNGE_ANIMATION,
  BEACH_CHAIR_LOUNGE_CONTROLLER,
  BEACH_CHAIR_UNFOLD_EVENT,
} from "../identifiers";
export class BedrockBeachChairWorld
  implements
    BeachChairWorld,
    BeachChairTakeBackWorld,
    BeachChairFormWorld,
    BeachChairRiderWorld
{
  constructor(
    private readonly deps: {
      topHosts: TopHostRegistry;
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {}
  state(id: BeachChairId): ChairState | undefined {
    const entity = this.entity(id);
    if (!entity) return undefined;
    return {
      form: entity.getProperty(BEACH_CHAIR_FOLDED) === true ? "table" : "chair",
      occupied: this.riderOf(id) !== undefined,
      somethingOnTop:
        this.deps.topHosts.itemsOnTop("beach_chair", id).length > 0,
    };
  }
  showRefused(
    player: PlayerId,
    reason: "occupied" | "somethingOnTop" | "wrongForm",
  ): void {
    this.show(
      player,
      reason === "occupied"
        ? "occupied"
        : reason === "wrongForm"
          ? "folded"
          : "something_on_top",
    );
  }
  riderOf(id: BeachChairId): PlayerId | undefined {
    const rider = this.entity(id)
      ?.getComponent("minecraft:rideable")
      ?.getRiders()
      .find((entity) => entity.typeId === "minecraft:player");
    return rider ? asPlayerId(rider.id) : undefined;
  }
  seat(id: BeachChairId, playerId: PlayerId): boolean {
    const chair = this.entity(id);
    const player = playerById(playerId);
    if (!chair || !player?.isValid || player.getComponent("minecraft:riding"))
      return false;
    try {
      const offset = BEACH_CHAIR_SPEC.seatOffset;
      const facing = forward(chair.getRotation().y);
      const right = rightOf(facing);
      // addRider requires a nearby player in the chair's dimension.
      player.teleport(
        {
          x: chair.location.x + right.x * offset.x - facing.x * offset.z,
          y: chair.location.y + offset.y,
          z: chair.location.z + right.z * offset.x - facing.z * offset.z,
        },
        { dimension: chair.dimension },
      );
      return (
        chair.getComponent("minecraft:rideable")?.addRider(player) === true
      );
    } catch (error) {
      console.warn(`[${NAMESPACE}] beach chair seating failed: ${error}`);
      return false;
    }
  }
  playLounge(playerId: PlayerId): void {
    try {
      playerById(playerId)?.playAnimation(BEACH_CHAIR_LOUNGE_ANIMATION, {
        stopExpression: "!query.is_riding",
        controller: BEACH_CHAIR_LOUNGE_CONTROLLER,
      });
    } catch (error) {
      console.warn(`[${NAMESPACE}] beach chair pose failed: ${error}`);
    }
  }
  placeBeside(id: BeachChairId, playerId: PlayerId): void {
    const chair = this.entity(id);
    const player = playerById(playerId);
    // Do not pull a player out of a new ride or back after a dimension change.
    if (
      !chair ||
      !player?.isValid ||
      player.dimension.id !== chair.dimension.id ||
      player.getComponent("minecraft:riding")
    )
      return;
    const dimension = chair.dimension;
    const dimensionId = asDimensionId(dimension.id);
    const feet = beachChairExit(
      beachChairPoseAt(chair.location, snapYaw4(chair.getRotation().y)),
      (cell) => {
        const floor = safeBlockAt(dimension, { ...cell, y: cell.y - 1 });
        return (
          floor !== undefined &&
          !floor.isAir &&
          !floor.isLiquid &&
          !CLEARABLE_DECORATIONS.has(floor.typeId) &&
          [cell, { ...cell, y: cell.y + 1 }].every(
            (at) =>
              safeBlockAt(dimension, at)?.isAir === true &&
              !this.deps.isVehicleSpace(dimensionId, at) &&
              !this.deps.isCampSpace(dimensionId, at),
          )
        );
      },
    );
    if (feet)
      player.teleport(
        { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 },
        { dimension },
      );
  }
  entity(id: BeachChairId): Entity | undefined {
    try {
      return entityOfType(world, id, BEACH_CHAIR);
    } catch {
      return undefined;
    }
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
  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, BEACH_CHAIR_ITEM, slot);
  }
  refund(player: PlayerId, _slot: number): void {
    const entity = playerById(player);
    if (entity) giveOrDrop(entity, [new ItemStack(BEACH_CHAIR_ITEM, 1)]);
  }
  spawn(
    dimension: DimensionId,
    pose: BeachChairPose,
  ): BeachChairId | undefined {
    let entity: Entity | undefined;
    try {
      entity = world
        .getDimension(dimension)
        .spawnEntity(BEACH_CHAIR, beachChairOrigin(pose));
      entity.setRotation({ x: 0, y: pose.yaw });
      return asBeachChairId(entity.id);
    } catch {
      try {
        entity?.remove();
      } catch {
        // A chunk can unload between a failed spawn setter and its rollback.
      }
      return undefined;
    }
  }
  setForm(id: BeachChairId, form: ChairForm): void {
    const entity = this.entity(id);
    if (!entity) return;
    entity.setProperty(BEACH_CHAIR_FOLDED, form === "table");
    if (form === "table") {
      entity.triggerEvent(BEACH_CHAIR_FOLD_EVENT);
      this.hold(entity);
    } else {
      entity.triggerEvent(BEACH_CHAIR_UNFOLD_EVENT);
    }
  }
  /**
   * Without gravity or collision the table keeps the downward velocity it had
   * resting on the floor and sinks through it, so it is pinned to its
   * placement pose origin, as the docked boat is (ADR 0063).
   */
  private hold(entity: Entity): void {
    try {
      const pose = beachChairPoseAt(
        entity.location,
        snapYaw4(entity.getRotation().y),
      );
      entity.clearVelocity();
      entity.teleport(beachChairOrigin(pose));
    } catch {
      // The entity can unload between lookup and holding its pose.
    }
  }
  dropItem(id: BeachChairId, player: PlayerId | undefined): void {
    const entity = this.entity(id);
    if (!entity) return;
    const receiver = player === undefined ? undefined : playerById(player);
    const item = new ItemStack(BEACH_CHAIR_ITEM, 1);
    if (receiver) giveOrDrop(receiver, [item]);
    else entity.dimension.spawnItem(item, entity.location);
  }
  remove(id: BeachChairId): void {
    this.entity(id)?.remove();
  }
  showBlocked(player: PlayerId): void {
    this.show(player, "blocked");
  }
  showRemaining(player: PlayerId, left: number): void {
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
      translate: `yasu_ride.beach_chair.${message}`,
      with: withArgs,
    });
  }
}
