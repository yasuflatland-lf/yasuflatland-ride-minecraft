import { ItemStack } from "@minecraft/server";
import type { GroundCellsWorld } from "../../application/shared/ports/groundCells";
import type { ItemPayment } from "../../application/shared/ports/itemPayment";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { blockIn } from "./blocks";
import { isOwnTypeId } from "./identifiers";
import { consumeHeld, giveOrDrop, isCreative, playerById } from "./players";

/** The block and player reads every ground-placed item shares (ADR 0122, 0129). */
export class BedrockGroundCells implements GroundCellsWorld {
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
  implements ItemPayment
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

  refund(player: PlayerId, _slot: number): void {
    const entity = playerById(player);
    if (entity) giveOrDrop(entity, [new ItemStack(this.itemId, 1)]);
  }
}
