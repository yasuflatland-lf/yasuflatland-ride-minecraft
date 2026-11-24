// Implements ChairWorld with @minecraft/server (ADR 0012, 0122).

import { world } from "@minecraft/server";
import type { ChairWorld } from "../../../application/camp/ports/chair";
import {
  asChairId,
  type ChairId,
  type ChairKindId,
} from "../../../domain/camp/chair";
import { CHAIR_SPEC } from "../../../domain/camp/spec";
import { cellCenter } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { entityOfType, spawnWithRollback } from "../../shared/entities";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { BedrockGroundCells } from "../../shared/groundCells";
import {
  consumeHeld,
  playerById,
  showHitsLeftHint,
} from "../../shared/players";
import { CHAIR_KIND_BY_TYPE, CHAIR_KINDS } from "../identifiers";

// A chair spawns at the bottom of its cell and may settle up to a block lower,
// through short grass or a slab's empty half (ADR 0122). From halfway down that
// fall, a chair of the cell is within half a block and one of a neighbor cell, which
// spawned at that cell's middle, is at least a block away.
const SAME_CELL_DISTANCE = 0.75;

function chairOf(chairId: ChairId) {
  return entityOfType(world, chairId, CHAIR_KIND_BY_TYPE);
}

export class BedrockChairWorld
  extends BedrockGroundCells
  implements ChairWorld
{
  constructor(vehicles: {
    isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
  }) {
    super((dimension, cell) => vehicles.isVehicleSpace(dimension, cell));
  }

  kindOf(chairId: ChairId): ChairKindId | undefined {
    const chair = chairOf(chairId);
    return chair === undefined
      ? undefined
      : CHAIR_KIND_BY_TYPE.get(chair.typeId);
  }

  hasChairAt(kind: ChairKindId, dimensionId: DimensionId, cell: Vec3): boolean {
    try {
      return (
        world.getDimension(dimensionId).getEntities({
          type: CHAIR_KINDS[kind].typeId,
          location: cellCenter(cell, -0.5),
          maxDistance: SAME_CELL_DISTANCE,
        }).length > 0
      );
    } catch {
      return false;
    }
  }

  consumeChairItem(
    kind: ChairKindId,
    playerId: PlayerId,
    slot: number,
  ): boolean {
    const player = playerById(playerId);
    return (
      player !== undefined &&
      consumeHeld(player, CHAIR_KINDS[kind].itemId, slot)
    );
  }

  refundChairItem(kind: ChairKindId, playerId: PlayerId): void {
    const player = playerById(playerId);
    if (player) giveBack(player, CHAIR_KINDS[kind].itemId, player);
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
    const riders = chairOf(chairId)
      ?.getComponent("minecraft:rideable")
      ?.getRiders();
    return (riders?.length ?? 0) > 0;
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
