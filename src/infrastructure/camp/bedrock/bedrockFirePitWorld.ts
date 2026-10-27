import { ItemStack, world } from "@minecraft/server";
import type { FirePitWorld } from "../../../application/camp/ports/firePit";
import type { FirePitId } from "../../../domain/camp/firePit";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  DUTCH_OVEN_ON_TOP_HINT,
  FIRE_PIT_COVERED_PROPERTY,
  FIRE_PIT_HITS_LEFT_HINT,
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
} from "../identifiers";

function firePit(id: FirePitId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === FIRE_PIT_TYPE
    ? entity
    : undefined;
}

export class BedrockFirePitWorld implements FirePitWorld {
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

  hasFirePitNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world
        .getDimension(dimension)
        .getEntities({ type: FIRE_PIT_TYPE, location: at, maxDistance: 1.25 })
        .length > 0
    );
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, FIRE_PIT_ITEM, slot);
  }

  spawnFirePit(dimension: DimensionId, at: Vec3, yaw: number): void {
    world
      .getDimension(dimension)
      .spawnEntity(FIRE_PIT_TYPE, at)
      .setRotation({ x: 0, y: yaw });
  }

  isCovered(id: FirePitId): boolean {
    return firePit(id)?.getProperty(FIRE_PIT_COVERED_PROPERTY) === true;
  }

  setCovered(id: FirePitId, covered: boolean): void {
    firePit(id)?.setProperty(FIRE_PIT_COVERED_PROPERTY, covered);
  }

  showCoveredHint(player: PlayerId): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: DUTCH_OVEN_ON_TOP_HINT,
    });
  }

  isLit(id: FirePitId): boolean {
    return firePit(id)?.getProperty(FIRE_PIT_LIT_PROPERTY) === true;
  }

  setLit(id: FirePitId, lit: boolean): void {
    firePit(id)?.setProperty(FIRE_PIT_LIT_PROPERTY, lit);
  }

  wearFlintAndSteel(player: PlayerId, slot: number): void {
    const inventory = playerById(player)?.getComponent(
      "minecraft:inventory",
    )?.container;
    const item = inventory?.getItem(slot);
    if (item?.typeId !== "minecraft:flint_and_steel") return;
    const durability = item.getComponent("minecraft:durability");
    if (!durability || durability.unbreakable) return;
    if (durability.damage + 1 >= durability.maxDurability)
      inventory?.setItem(slot);
    else {
      durability.damage += 1;
      inventory?.setItem(slot, item);
    }
  }

  dropItem(id: FirePitId): void {
    const entity = firePit(id);
    entity?.dimension.spawnItem(
      new ItemStack(FIRE_PIT_ITEM, 1),
      entity.location,
    );
  }

  removeFirePit(id: FirePitId): void {
    firePit(id)?.remove();
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: FIRE_PIT_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
