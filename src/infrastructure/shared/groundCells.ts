import { ItemStack } from "@minecraft/server";
import type { GroundCellsWorld } from "../../application/shared/ports/groundCells";
import type { ItemPayment } from "../../application/shared/ports/itemPayment";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { blockIn } from "./blocks";
import { isOwnTypeId } from "./identifiers";
import { consumeHeld, giveOrDrop, isCreative, playerById } from "./players";

function creativePlayer(player: PlayerId): boolean {
  return isCreative(playerById(player));
}

/** The block and space reads every ground-placed item shares (ADR 0122, 0129). */
export class BedrockGroundCells implements GroundCellsWorld {
  constructor(private readonly vehicleSpace: SpaceCheck) {}

  isAir(dimension: DimensionId, at: Cell): boolean {
    return blockIn(dimension, at)?.isAir === true;
  }

  isOwnBlock(dimension: DimensionId, at: Cell): boolean {
    return isOwnTypeId(blockIn(dimension, at)?.typeId);
  }

  isVehicleSpace(dimension: DimensionId, at: Cell): boolean {
    return this.vehicleSpace(dimension, at);
  }
}

/** Adds payment with one fixed item id (ADR 0024). */
export class BedrockPaidGroundCells
  extends BedrockGroundCells
  implements ItemPayment
{
  isCreative(player: PlayerId): boolean {
    return creativePlayer(player);
  }

  readonly consumeItem;
  readonly refund;

  constructor(isVehicleSpace: SpaceCheck, itemId: string) {
    super(isVehicleSpace);
    const payment = paidItem(itemId);
    this.consumeItem = payment.consumeItem;
    this.refund = payment.refund;
  }
}

export function paidItem(
  itemId: string,
  checkCreative = creativePlayer,
): ItemPayment {
  return {
    isCreative: checkCreative,
    consumeItem(player, slot) {
      const entity = playerById(player);
      return entity !== undefined && consumeHeld(entity, itemId, slot);
    },
    refund(player) {
      const entity = playerById(player);
      if (entity) giveOrDrop(entity, [new ItemStack(itemId, 1)]);
    },
  };
}
