// Implements PlacementWorld with @minecraft/server (ADR 0012).
import { GameMode, world } from "@minecraft/server";
import type { PlacementWorld } from "../../../application/vehicle/ports/placement";
import {
  asVehicleId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { PlacementGift } from "../../../domain/vehicle/placement/gift";
import type { BedrockInventory } from "./bedrockInventory";
import type { EntityIndex } from "./entityIndex";
import { isLightBlock } from "./headlightBlocks";
import { ENTITY_TYPE, ITEM_TYPE, OWNER_PROPERTY } from "./identifiers";
import { isWaterAt } from "./water";

/** Whether the player is in Creative; false for a missing player. */
export function isCreativePlayer(
  index: EntityIndex,
  playerId: PlayerId,
): boolean {
  const player = index.player(playerId);
  // getGameMode throws on a handle whose player has left (isValid false).
  return player?.isValid === true && player.getGameMode() === GameMode.Creative;
}

export class BedrockPlacementWorld implements PlacementWorld {
  constructor(
    private readonly inventory: BedrockInventory,
    private readonly index: EntityIndex,
  ) {}

  isAir(dimensionId: DimensionId, at: Vec3): boolean {
    try {
      const b = world.getDimension(dimensionId).getBlock(at);
      return b !== undefined && (b.isAir || isLightBlock(b));
    } catch {
      return false;
    }
  }

  isWaterAt(dimensionId: DimensionId, at: Vec3): boolean {
    try {
      return isWaterAt(world.getDimension(dimensionId), at);
    } catch {
      return false; // Unknown dimension id
    }
  }

  spawnVehicle(
    dimensionId: DimensionId,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: PlayerId,
  ): VehicleId {
    const vehicle = world
      .getDimension(dimensionId)
      .spawnEntity(ENTITY_TYPE[kind], at);
    vehicle.setRotation({ x: 0, y: yaw });
    vehicle.setDynamicProperty(OWNER_PROPERTY, ownerId);
    return asVehicleId(vehicle.id);
  }

  consumeVehicleItem(
    playerId: PlayerId,
    slot: number,
    kind: VehicleKind,
  ): boolean {
    return this.inventory.consumeHeld(playerId, ITEM_TYPE[kind], slot);
  }

  receivedGift(playerId: PlayerId, gift: PlacementGift): boolean | undefined {
    return this.inventory.receivedGift(playerId, gift);
  }

  giveGift(playerId: PlayerId, gift: PlacementGift): void {
    this.inventory.giveGift(playerId, gift);
  }

  markGiftReceived(playerId: PlayerId, gift: PlacementGift): void {
    this.inventory.markGiftReceived(playerId, gift);
  }
  isCreative(playerId: PlayerId): boolean {
    return isCreativePlayer(this.index, playerId);
  }
}
