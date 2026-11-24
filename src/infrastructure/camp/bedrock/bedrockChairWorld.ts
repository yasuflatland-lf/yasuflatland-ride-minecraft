// Implements ChairWorld with @minecraft/server (ADR 0012, 0122).

import { world } from "@minecraft/server";
import type { ChairWorld } from "../../../application/camp/ports/chair";
import {
  asChairId,
  type ChairId,
  type ChairKindId,
} from "../../../domain/camp/chair";
import { CHAIR_SPEC } from "../../../domain/camp/spec";
import { type Cell, cellCenter } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  entityOfType,
  hasEntityNear,
  spawnWithRollback,
} from "../../shared/entities";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { BedrockGroundCells, paidItem } from "../../shared/groundCells";
import { showHitsLeftHint } from "../../shared/players";
import { playerRiderOf } from "../../shared/seating";
import { CHAIR_KIND_BY_TYPE, CHAIR_KINDS } from "../identifiers";

function chairOf(chairId: ChairId) {
  return entityOfType(world, chairId, CHAIR_KIND_BY_TYPE);
}

export class BedrockChairWorld
  extends BedrockGroundCells
  implements ChairWorld
{
  constructor(vehicles: {
    isVehicleSpace(dimensionId: DimensionId, cell: Cell): boolean;
  }) {
    super((dimension, cell) => vehicles.isVehicleSpace(dimension, cell));
  }

  kindOf(chairId: ChairId): ChairKindId | undefined {
    const chair = chairOf(chairId);
    return chair === undefined
      ? undefined
      : CHAIR_KIND_BY_TYPE.get(chair.typeId);
  }

  hasChairAt(kind: ChairKindId, dimensionId: DimensionId, cell: Cell): boolean {
    return (
      hasEntityNear(
        dimensionId,
        CHAIR_KINDS[kind].typeId,
        cellCenter(cell, -0.5),
        CHAIR_SPEC.sameCellDistance,
      ) ?? false
    );
  }

  paymentFor(kind: ChairKindId) {
    return paidItem(CHAIR_KINDS[kind].itemId);
  }

  spawnChair(
    kind: ChairKindId,
    dimensionId: DimensionId,
    at: Vec3,
    yaw: number,
  ): ChairId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimensionId),
      CHAIR_KINDS[kind].typeId,
      at,
      yaw,
    );
    return entity && asChairId(entity.id);
  }

  isOccupied(chairId: ChairId): boolean {
    return playerRiderOf(chairOf(chairId)) !== undefined;
  }

  removeChair(chairId: ChairId): void {
    chairOf(chairId)?.remove();
  }

  dropChairItem(chairId: ChairId, hitter?: PlayerId): void {
    const chair = chairOf(chairId);
    if (chair === undefined) return;
    const kind = CHAIR_KIND_BY_TYPE.get(chair.typeId);
    if (kind === undefined) return;
    giveBack(
      chair,
      CHAIR_KINDS[kind].itemId,
      giveBackReceiver(CHAIR_SPEC.giveBack, hitter),
    );
  }

  showHitsLeft(kind: ChairKindId, playerId: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(playerId, CHAIR_KINDS[kind].hitsHint, hitsLeft);
  }
}
