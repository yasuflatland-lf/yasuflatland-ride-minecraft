// Implements DecorPlacingWorld with @minecraft/server: saving decor and placing it by hand (ADR 0012, 0024, 0093).
import type { Entity } from "@minecraft/server";
import type { DecorPlacingWorld } from "../../../../application/vehicle/room/ports";
import type { PlayerId, VehicleId } from "../../../../domain/shared/ids";
import {
  type DecorItemId,
  type DecorPlacement,
  serializeDecor,
} from "../../../../domain/vehicle/kinds/index";
import { messageKey } from "../../../shared/identifiers";
import type { ActionBarLog } from "../../bedrock/actionBarLog";
import type { BedrockInventory } from "../../bedrock/bedrockInventory";
import { isCreativePlayer } from "../../bedrock/bedrockPlacementWorld";
import type { EntityIndex } from "../../bedrock/entityIndex";
import { campingGearItem, DECOR_PROPERTY } from "./identifiers";

/** The decor JSON saved on a vehicle, read when its aggregate is rebuilt. */
export function savedDecor(
  vehicle: Pick<Entity, "getDynamicProperty">,
): string | undefined {
  const raw = vehicle.getDynamicProperty(DECOR_PROPERTY);
  return typeof raw === "string" ? raw : undefined;
}

export class BedrockDecorWorld implements DecorPlacingWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly inventory: Pick<
      BedrockInventory,
      "consumeHeld" | "giveItems"
    >,
    private readonly actionBar: ActionBarLog,
  ) {}

  saveDecor(vehicleId: VehicleId, decor: readonly DecorPlacement[]): void {
    this.index
      .entity(vehicleId)
      ?.setDynamicProperty(DECOR_PROPERTY, serializeDecor(decor));
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreativePlayer(this.index, playerId);
  }

  consumeDecorItem(
    playerId: PlayerId,
    hotbarSlot: number,
    item: DecorItemId,
  ): boolean {
    return this.inventory.consumeHeld(
      playerId,
      campingGearItem(item),
      hotbarSlot,
    );
  }

  giveDecorItems(playerId: PlayerId, items: readonly DecorItemId[]): void {
    this.inventory.giveItems(playerId, items.map(campingGearItem));
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.actionBar.write(playerId, {
      translate: messageKey(name),
    });
  }
}
