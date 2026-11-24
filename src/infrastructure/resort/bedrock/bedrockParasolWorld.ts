import { type Entity, world } from "@minecraft/server";
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
import { PARASOL_SPEC } from "../../../domain/resort/spec";
import { type Cell, cellCenter } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import {
  gearEntities,
  gearFeedback,
  gearGroundChecks,
  giveBack,
  giveBackReceiver,
  spawnIn,
} from "../../shared/gearEntity";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import { SingleBlockLayer } from "../../shared/laidBlockLayer";
import {
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  PARASOL_CEILING_BLOCK,
  PARASOL_CEILING_PROPERTY,
} from "../identifiers";

const entities = gearEntities<ParasolId>(BEACH_PARASOL);
const feedback = gearFeedback("parasol");

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

  private readonly layer: SingleBlockLayer<ParasolId>;
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

    this.layer = new SingleBlockLayer(
      PARASOL_CEILING_BLOCK,
      PARASOL_CEILING_PROPERTY,
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
  remember(entity: Entity): void {
    this.layer.remember(asParasolId(entity.id), entity);
  }
  layCeiling(id: ParasolId): void {
    const entity = this.entity(id);
    if (!entity) return;
    const pose = parasolPoseAt(
      {
        x: entity.location.x - 0.5,
        y: Math.floor(entity.location.y),
        z: entity.location.z - 0.5,
      },
      entity.getRotation().y,
    );
    this.layer.lay(id, entity, parasolCeilingCells(pose));
  }
  clearCeiling(id: ParasolId): boolean {
    return this.layer.clear(id, this.entity(id)).length === 0;
  }
  ceilingOwner(
    dimension: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    return this.layer.ownerOf(dimension, cell, typeId);
  }
  dropItem(id: ParasolId, player: PlayerId | undefined): void {
    const entity = this.entity(id);
    if (!entity) return;
    const receiver = giveBackReceiver(PARASOL_SPEC.giveBack, player);
    giveBack(entity, BEACH_PARASOL_ITEM, receiver);
  }
}
