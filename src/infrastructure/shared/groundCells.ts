import type { GroundCellsWorld } from "../../application/shared/ports/groundCells";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { blockIn } from "./blocks";
import { isOwnTypeId } from "./identifiers";
import { consumeHeld, isCreative, playerById } from "./players";

/** The block and player reads every ground-placed item shares (ADR 0122, 0129). */
export class BedrockGroundCells
  implements Omit<GroundCellsWorld, "consumeItem">
{
  constructor(private readonly vehicleSpace: SpaceCheck) {}

  isAir(dimension: DimensionId, at: Vec3): boolean {
    return blockIn(dimension, at)?.isAir === true;
  }

  isOwnBlock(dimension: DimensionId, at: Vec3): boolean {
    return isOwnTypeId(blockIn(dimension, at)?.typeId);
  }

  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean {
    return this.vehicleSpace(dimension, at);
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }
}

/** Adds payment with one fixed item id (ADR 0024). */
export class BedrockPaidGroundCells
  extends BedrockGroundCells
  implements GroundCellsWorld
{
  constructor(
    isVehicleSpace: SpaceCheck,
    private readonly itemId: string,
  ) {
    super(isVehicleSpace);
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, this.itemId, slot);
  }
}
