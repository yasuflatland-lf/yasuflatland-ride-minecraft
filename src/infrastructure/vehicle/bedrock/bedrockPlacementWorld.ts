// Implements PlacementWorld with @minecraft/server (ADR 0012).
import { world } from "@minecraft/server";
import type { PlacementWorld } from "../../../application/vehicle/ports";
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { BedrockInventory } from "./bedrockInventory";
import { isLightBlock } from "./headlightBlocks";
import { ENTITY_TYPE, ITEM_TYPE, OWNER_PROPERTY } from "./identifiers";
import { isWaterAt } from "./water";

export class BedrockPlacementWorld implements PlacementWorld {
  constructor(private readonly inventory: BedrockInventory) {}

  isAir(dimensionId: string, at: Vec3): boolean {
    try {
      const b = world.getDimension(dimensionId).getBlock(at);
      return b !== undefined && (b.isAir || isLightBlock(b));
    } catch {
      return false;
    }
  }

  isWaterAt(dimensionId: string, at: Vec3): boolean {
    try {
      return isWaterAt(world.getDimension(dimensionId), at);
    } catch {
      return false; // Unknown dimension id
    }
  }

  spawnVehicle(
    dimensionId: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ): string {
    const vehicle = world
      .getDimension(dimensionId)
      .spawnEntity(ENTITY_TYPE[kind], at);
    vehicle.setRotation({ x: 0, y: yaw });
    vehicle.setDynamicProperty(OWNER_PROPERTY, ownerId);
    return vehicle.id;
  }

  consumeVehicleItem(
    playerId: string,
    slot: number,
    kind: VehicleKind,
  ): boolean {
    return this.inventory.consumeHeld(playerId, ITEM_TYPE[kind], slot);
  }
}
