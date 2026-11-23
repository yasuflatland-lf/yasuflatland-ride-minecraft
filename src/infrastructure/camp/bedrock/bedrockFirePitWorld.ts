import { world } from "@minecraft/server";
import type { FirePitWorld } from "../../../application/camp/ports/firePit";
import { asFirePitId, type FirePitId } from "../../../domain/camp/firePit";
import { FIRE_PIT_SPEC } from "../../../domain/camp/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { spawnWithRollback } from "../../shared/entities";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import {
  playerById,
  showActionBar,
  showHitsLeftHint,
} from "../../shared/players";
import {
  DUTCH_OVEN_ON_TOP_HINT,
  FIRE_PIT_HITS_LEFT_HINT,
  FIRE_PIT_IGNITER_ITEM,
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
} from "../identifiers";
import { firePitEntity as firePit, isFirePitCovered } from "./firePitCovered";

export class BedrockFirePitWorld
  extends BedrockPaidGroundCells
  implements FirePitWorld
{
  constructor(vehicles: {
    isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
  }) {
    super(
      (dimension, cell) => vehicles.isVehicleSpace(dimension, cell),
      FIRE_PIT_ITEM,
    );
  }

  hasFirePitNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world.getDimension(dimension).getEntities({
        type: FIRE_PIT_TYPE,
        location: at,
        maxDistance: FIRE_PIT_SPEC.spacing,
      }).length > 0
    );
  }

  spawnFirePit(
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
  ): FirePitId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimension),
      FIRE_PIT_TYPE,
      at,
      yaw,
    );
    return entity && asFirePitId(entity.id);
  }

  isCovered(id: FirePitId): boolean {
    return isFirePitCovered(id);
  }

  showCoveredHint(player: PlayerId): void {
    showActionBar(player, {
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
    if (item?.typeId !== FIRE_PIT_IGNITER_ITEM) return;
    const durability = item.getComponent("minecraft:durability");
    if (!durability || durability.unbreakable) return;
    if (durability.damage + 1 >= durability.maxDurability)
      inventory?.setItem(slot);
    else {
      durability.damage += 1;
      inventory?.setItem(slot, item);
    }
  }

  dropItem(id: FirePitId, hitter?: PlayerId): void {
    const entity = firePit(id);
    if (entity)
      giveBack(
        entity,
        FIRE_PIT_ITEM,
        giveBackReceiver(FIRE_PIT_SPEC.giveBack, hitter),
      );
  }

  removeFirePit(id: FirePitId): void {
    firePit(id)?.remove();
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(player, FIRE_PIT_HITS_LEFT_HINT, hitsLeft);
  }
}
