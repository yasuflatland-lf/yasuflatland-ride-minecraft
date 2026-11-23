import { type Dimension, type Entity, world } from "@minecraft/server";
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
import {
  type Cell,
  cellCenter,
  cellKey,
  sameCell,
} from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import {
  gearEntities,
  gearFeedback,
  gearGroundChecks,
  giveBack,
  spawnIn,
} from "../../shared/gearEntity";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import {
  LaidBlockLayer,
  readSavedCells,
  writeSavedCells,
} from "../../shared/laidBlockLayer";
import { playerById } from "../../shared/players";
import {
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  PARASOL_CEILING_BLOCK,
  PARASOL_CEILING_PROPERTY,
} from "../identifiers";

const entities = gearEntities<ParasolId>(BEACH_PARASOL);
const feedback = gearFeedback("parasol");

interface CeilingRecord {
  dimension: Dimension;
  cells: Cell[];
}

export class BedrockParasolWorld
  extends BedrockPaidGroundCells
  implements ParasolWorld, ParasolTakeBackWorld
{
  entity = entities.entity;
  remove = entities.remove;
  showBlocked = feedback.showBlocked;
  showHitsLeft = feedback.showHitsLeft;
  showTaken = feedback.showTaken;
  readonly isSolidTop: SpaceCheck;
  readonly isCampSpace: SpaceCheck;

  private readonly layer: LaidBlockLayer;
  private readonly ceilings = new Map<ParasolId, CeilingRecord>();
  constructor(deps: {
    isVehicleSpace: SpaceCheck;
    isCampSpace: SpaceCheck;
  }) {
    super(
      (dimension, cell) => deps.isVehicleSpace(dimension, cell),
      BEACH_PARASOL_ITEM,
    );
    ({ isSolidTop: this.isSolidTop, isCampSpace: this.isCampSpace } =
      gearGroundChecks(deps));

    this.layer = new LaidBlockLayer(
      PARASOL_CEILING_BLOCK,
      deps.isVehicleSpace,
      "parasol ceiling",
    );
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
        x: entity.location.x - 0.5,
        y: Math.floor(entity.location.y),
        z: entity.location.z - 0.5,
      }));
  }
  spawn(dimension: DimensionId, pose: ParasolPose): ParasolId | undefined {
    const entity = spawnIn(
      dimension,
      BEACH_PARASOL,
      cellCenter(pose.base),
      pose.yaw,
    );
    return entity && asParasolId(entity.id);
  }
  remember(entity: Entity): CeilingRecord {
    const id = asParasolId(entity.id);
    let record = this.ceilings.get(id);
    if (!record) {
      record = {
        dimension: entity.dimension,
        cells: readSavedCells(
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
        x: entity.location.x - 0.5,
        y: Math.floor(entity.location.y),
        z: entity.location.z - 0.5,
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
        writeSavedCells(record.cells),
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
        writeSavedCells(record.cells),
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
        record.cells.some((at) => sameCell(at, cell))
      )
        return id;
    }
    return undefined;
  }
  dropItem(id: ParasolId, player: PlayerId | undefined): void {
    const entity = this.entity(id);
    if (!entity) return;
    const receiver = player === undefined ? undefined : playerById(player);
    giveBack(entity, BEACH_PARASOL_ITEM, receiver);
  }
}
