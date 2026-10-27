import { ItemStack, world } from "@minecraft/server";
import type { DutchOvenWorld } from "../../../application/camp/ports/dutchOven";
import type { DutchOvenId } from "../../../domain/camp/dutchOven";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  DUTCH_OVEN_HITS_LEFT_HINT,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_TYPE,
} from "../identifiers";

function dutchOven(id: DutchOvenId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === DUTCH_OVEN_TYPE
    ? entity
    : undefined;
}

export class BedrockDutchOvenWorld implements DutchOvenWorld {
  constructor(
    private readonly vehicles: {
      isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
    },
  ) {}

  isAir(dimension: DimensionId, at: Vec3): boolean {
    try {
      return world.getDimension(dimension).getBlock(at)?.isAir === true;
    } catch {
      return false;
    }
  }

  isOwnBlock(dimension: DimensionId, at: Vec3): boolean {
    try {
      return (
        world
          .getDimension(dimension)
          .getBlock(at)
          ?.typeId.startsWith(`${NAMESPACE}:`) === true
      );
    } catch {
      return false;
    }
  }

  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean {
    return this.vehicles.isVehicleSpace(dimension, at);
  }

  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world
        .getDimension(dimension)
        .getEntities({ type: DUTCH_OVEN_TYPE, location: at, maxDistance: 0.5 })
        .length > 0
    );
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, DUTCH_OVEN_ITEM, slot);
  }

  spawnDutchOven(dimension: DimensionId, at: Vec3, yaw: number): void {
    world
      .getDimension(dimension)
      .spawnEntity(DUTCH_OVEN_TYPE, at)
      .setRotation({ x: 0, y: yaw });
  }

  dropItem(id: DutchOvenId): void {
    const entity = dutchOven(id);
    entity?.dimension.spawnItem(
      new ItemStack(DUTCH_OVEN_ITEM, 1),
      entity.location,
    );
  }

  removeDutchOven(id: DutchOvenId): void {
    dutchOven(id)?.remove();
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: DUTCH_OVEN_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
