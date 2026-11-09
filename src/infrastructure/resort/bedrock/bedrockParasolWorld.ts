import {
  type Dimension,
  Direction,
  type Entity,
  ItemStack,
  world,
} from "@minecraft/server";
import type {
  ParasolTakeBackWorld,
  ParasolWorld,
} from "../../../application/resort/ports/parasolWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asParasolId, type ParasolId } from "../../../domain/resort/ids";
import {
  type ParasolPose,
  parasolCeilingCells,
  parasolPoseAt,
} from "../../../domain/resort/parasolPose";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import { entityOfType } from "../../shared/entities";
import { NAMESPACE } from "../../shared/identifiers";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
} from "../../shared/players";
import {
  RainCeilingLayer,
  readCeilingCells,
  writeCeilingCells,
} from "../../shared/rainCeiling";
import {
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  PARASOL_CEILING_BLOCK,
  PARASOL_CEILING_PROPERTY,
} from "../identifiers";

interface CeilingRecord {
  dimension: Dimension;
  cells: Cell[];
}

export class BedrockParasolWorld implements ParasolWorld, ParasolTakeBackWorld {
  private readonly layer: RainCeilingLayer;
  private readonly ceilings = new Map<ParasolId, CeilingRecord>();
  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {
    this.layer = new RainCeilingLayer(
      PARASOL_CEILING_BLOCK,
      deps.isVehicleSpace,
      "parasol ceiling",
    );
  }
  entity(id: ParasolId): Entity | undefined {
    try {
      return entityOfType(world, id, BEACH_PARASOL);
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
  baseCellsNear(dimension: DimensionId, at: Cell, radius: number): Cell[] {
    // An axis-aligned query includes every base in the Chebyshev spacing cube.
    return world
      .getDimension(dimension)
      .getEntities({
        type: BEACH_PARASOL,
        location: { x: at.x - radius, y: at.y - radius, z: at.z - radius },
        volume: { x: radius * 2 + 1, y: radius * 2 + 1, z: radius * 2 + 1 },
      })
      .map((entity) => ({
        x: Math.floor(entity.location.x),
        y: Math.floor(entity.location.y),
        z: Math.floor(entity.location.z),
      }));
  }
  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }
  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return (
      entity !== undefined && consumeHeld(entity, BEACH_PARASOL_ITEM, slot)
    );
  }
  refund(player: PlayerId, _slot: number): void {
    const entity = playerById(player);
    if (entity) giveOrDrop(entity, [new ItemStack(BEACH_PARASOL_ITEM, 1)]);
  }
  spawn(dimension: DimensionId, pose: ParasolPose): ParasolId | undefined {
    let entity: Entity | undefined;
    try {
      entity = world.getDimension(dimension).spawnEntity(BEACH_PARASOL, {
        x: pose.base.x + 0.5,
        y: pose.base.y,
        z: pose.base.z + 0.5,
      });
      entity.setRotation({ x: 0, y: pose.yaw });
      return asParasolId(entity.id);
    } catch {
      try {
        entity?.remove();
      } catch {
        // A chunk can unload between a failed spawn setter and its rollback.
      }
      return undefined;
    }
  }
  remember(entity: Entity): CeilingRecord {
    const id = asParasolId(entity.id);
    let record = this.ceilings.get(id);
    if (!record) {
      record = {
        dimension: entity.dimension,
        cells: readCeilingCells(
          entity.getDynamicProperty(PARASOL_CEILING_PROPERTY),
        ),
      };
      this.ceilings.set(id, record);
    }
    return record;
  }
  layCeiling(id: ParasolId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const record = this.remember(entity);
    const pose = parasolPoseAt(
      {
        x: Math.floor(entity.location.x),
        y: Math.floor(entity.location.y),
        z: Math.floor(entity.location.z),
      },
      entity.getRotation().y,
    );
    const warn = this.layer.warning("lay");
    try {
      const wanted = parasolCeilingCells(pose);
      const keys = new Set(wanted.map(cellKey));
      const stale = record.cells.filter((cell) => !keys.has(cellKey(cell)));
      this.layer.clear(record.dimension, stale, warn);
      record.cells = record.cells.filter(
        (cell) =>
          keys.has(cellKey(cell)) ||
          safeBlockAt(record.dimension, cell) === undefined ||
          safeBlockAt(record.dimension, cell)?.typeId === PARASOL_CEILING_BLOCK,
      );
      record.cells = this.layer.lay(
        record.dimension,
        wanted,
        record.cells,
        warn,
      );
      entity.setDynamicProperty(
        PARASOL_CEILING_PROPERTY,
        writeCeilingCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
  }
  clearCeiling(id: ParasolId): boolean {
    const entity = this.entity(id);
    const record =
      this.ceilings.get(id) ?? (entity ? this.remember(entity) : undefined);
    if (!record) return true;
    const warn = this.layer.warning("clear");
    this.layer.clear(record.dimension, record.cells, warn);
    // Keep unloaded cells for later cleanup rather than losing their only record.
    record.cells = record.cells.filter(
      (cell) =>
        safeBlockAt(record.dimension, cell) === undefined ||
        safeBlockAt(record.dimension, cell)?.typeId === PARASOL_CEILING_BLOCK,
    );
    try {
      entity?.setDynamicProperty(
        PARASOL_CEILING_PROPERTY,
        writeCeilingCells(record.cells),
      );
    } catch (error) {
      warn(error);
    }
    if (record.cells.length === 0) this.ceilings.delete(id);
    return record.cells.length === 0;
  }
  ceilingOwner(
    dimension: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    if (typeId !== PARASOL_CEILING_BLOCK) return undefined;
    for (const [id, record] of this.ceilings) {
      if (
        record.dimension.id === dimension &&
        record.cells.some((at) => cellKey(at) === cellKey(cell))
      )
        return id;
    }
    return undefined;
  }
  dropItem(id: ParasolId, player: PlayerId | undefined): void {
    const entity = this.entity(id);
    if (!entity) return;
    const receiver = player === undefined ? undefined : playerById(player);
    const item = new ItemStack(BEACH_PARASOL_ITEM, 1);
    if (receiver) giveOrDrop(receiver, [item]);
    else entity.dimension.spawnItem(item, entity.location);
  }
  remove(id: ParasolId): void {
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
      translate: `yasu_ride.parasol.${message}`,
      with: withArgs,
    });
  }
}
