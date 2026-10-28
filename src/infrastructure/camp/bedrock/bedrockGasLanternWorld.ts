import { ItemStack, world } from "@minecraft/server";
import type { GasLanternWorld } from "../../../application/camp/ports/gasLantern";
import type { GasLanternId } from "../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../domain/camp/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  GAS_LANTERN_HITS_LEFT_HINT,
  GAS_LANTERN_ITEM,
  GAS_LANTERN_TYPE,
} from "../identifiers";

function gasLantern(id: GasLanternId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === GAS_LANTERN_TYPE
    ? entity
    : undefined;
}

export class BedrockGasLanternWorld implements GasLanternWorld {
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

  hasGasLanternNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world.getDimension(dimension).getEntities({
        type: GAS_LANTERN_TYPE,
        location: at,
        maxDistance: GAS_LANTERN_SPEC.spacing,
      }).length > 0
    );
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, GAS_LANTERN_ITEM, slot);
  }

  spawnGasLantern(dimension: DimensionId, at: Vec3, yaw: number): void {
    world
      .getDimension(dimension)
      .spawnEntity(GAS_LANTERN_TYPE, at)
      .setRotation({ x: 0, y: yaw });
  }

  dropItem(id: GasLanternId): void {
    const entity = gasLantern(id);
    entity?.dimension.spawnItem(
      new ItemStack(GAS_LANTERN_ITEM, 1),
      entity.location,
    );
  }

  removeGasLantern(id: GasLanternId): void {
    gasLantern(id)?.remove();
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: GAS_LANTERN_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
