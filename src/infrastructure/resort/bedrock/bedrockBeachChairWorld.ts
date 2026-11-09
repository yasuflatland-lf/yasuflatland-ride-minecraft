import {
  type Dimension,
  Direction,
  type Entity,
  ItemStack,
  world,
} from "@minecraft/server";
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
  tableBlockCells,
} from "../../../domain/resort/beachChair";
import { beachChairExit } from "../../../domain/resort/beachChairExit";
import { asBeachChairId, type BeachChairId } from "../../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../domain/resort/spec";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../domain/shared/decorations";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import { forward, rightOf } from "../../../domain/shared/vec";
import { safeBlockAt } from "../../shared/blocks";
import { entityOfType } from "../../shared/entities";
import { NAMESPACE } from "../../shared/identifiers";
import {
  LaidBlockLayer,
  readLaidCells,
  writeLaidCells,
} from "../../shared/laidBlockLayer";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLD_EVENT,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  BEACH_CHAIR_LOUNGE_ANIMATION,
  BEACH_CHAIR_LOUNGE_CONTROLLER,
  BEACH_CHAIR_TOP,
  BEACH_CHAIR_TOP_CELLS,
  BEACH_CHAIR_UNFOLD_EVENT,
} from "../identifiers";
export class BedrockBeachChairWorld
  implements
    BeachChairWorld,
    BeachChairTakeBackWorld,
    BeachChairFormWorld,
    BeachChairRiderWorld
{
  private readonly layer: LaidBlockLayer;
  private readonly tops = new Map<
    BeachChairId,
    { dimension: Dimension; cells: Cell[] }
  >();
  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {
    this.layer = new LaidBlockLayer(
      BEACH_CHAIR_TOP,
      deps.isVehicleSpace,
      "beach chair top",
    );
  }
  state(id: BeachChairId): ChairState | undefined {
    const entity = this.entity(id);
    if (!entity) return undefined;
    return {
      form: entity.getProperty(BEACH_CHAIR_FOLDED) === true ? "table" : "chair",
      occupied: this.riderOf(id) !== undefined,
      somethingOnTop: this.topCells(entity).some((cell) => {
        const above = safeBlockAt(entity.dimension, { ...cell, y: cell.y + 1 });
        return above?.isAir !== true;
      }),
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
  private topCells(entity: Entity): readonly Cell[] {
    if (entity.getProperty(BEACH_CHAIR_FOLDED) !== true) return [];
    return tableBlockCells(
      beachChairPoseAt(entity.location, snapYaw4(entity.getRotation().y)),
    );
  }
  setForm(id: BeachChairId, form: ChairForm): void {
    const entity = this.entity(id);
    if (!entity) return;
    entity.setProperty(BEACH_CHAIR_FOLDED, form === "table");
    if (form === "table") {
      entity.triggerEvent(BEACH_CHAIR_FOLD_EVENT);
      // Without collision the velocity left over from resting on the floor
      // carries the table down through it (measured on BDS: about 2 blocks in
      // 30 ticks), moving the pose that locates the tabletop cells.
      entity.clearVelocity();
      this.layTop(id);
    } else {
      this.clearTop(id);
      entity.triggerEvent(BEACH_CHAIR_UNFOLD_EVENT);
    }
  }
  syncTop(id: BeachChairId): void {
    if (this.entity(id)?.getProperty(BEACH_CHAIR_FOLDED) === true)
      this.layTop(id);
    else this.clearTop(id);
  }
  remember(entity: Entity): { dimension: Dimension; cells: Cell[] } {
    const id = asBeachChairId(entity.id);
    let record = this.tops.get(id);
    if (!record) {
      record = {
        dimension: entity.dimension,
        cells: readLaidCells(entity.getDynamicProperty(BEACH_CHAIR_TOP_CELLS)),
      };
      this.tops.set(id, record);
    }
    return record;
  }
  layTop(id: BeachChairId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const record = this.remember(entity);
    const pose = beachChairPoseAt(
      entity.location,
      snapYaw4(entity.getRotation().y),
    );
    const warn = this.layer.warning("lay");
    try {
      const wanted = tableBlockCells(pose);
      const keys = new Set(wanted.map(cellKey));
      const stale = record.cells.filter((cell) => !keys.has(cellKey(cell)));
      this.layer.clear(record.dimension, stale, warn);
      record.cells = record.cells.filter(
        (cell) =>
          keys.has(cellKey(cell)) ||
          safeBlockAt(record.dimension, cell) === undefined ||
          safeBlockAt(record.dimension, cell)?.typeId === BEACH_CHAIR_TOP,
      );
      record.cells = this.layer.lay(
        record.dimension,
        wanted,
        record.cells,
        warn,
      );
      entity.setDynamicProperty(
        BEACH_CHAIR_TOP_CELLS,
        writeLaidCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
  }
  clearTop(id: BeachChairId): boolean {
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
        safeBlockAt(record.dimension, cell)?.typeId === BEACH_CHAIR_TOP,
    );
    try {
      entity?.setDynamicProperty(
        BEACH_CHAIR_TOP_CELLS,
        writeLaidCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
    if (record.cells.length === 0) this.tops.delete(id);
    return record.cells.length === 0;
  }
  topOwner(
    dimension: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    if (typeId !== BEACH_CHAIR_TOP) return undefined;
    for (const [id, record] of this.tops) {
      if (
        record.dimension.id === dimension &&
        record.cells.some((at) => cellKey(at) === cellKey(cell))
      )
        return id;
    }
    return undefined;
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
    this.clearTop(id);
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
