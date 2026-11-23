import { world } from "@minecraft/server";
import {
  beachChairCells,
  beachChairPoseAt,
} from "../../../domain/resort/beachChair";
import {
  furnitureCells,
  furniturePoseAt,
} from "../../../domain/resort/furniture";
import type { Cell } from "../../../domain/shared/cells";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { DimensionId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { BEACH_CHAIR, furnitureKindOf } from "../identifiers";

export function resortGearCells(
  dimension: DimensionId,
  near: Vec3,
  radius: number,
): Cell[] {
  const entities = world
    .getDimension(dimension)
    .getEntities({ location: near, maxDistance: radius });
  return entities.flatMap((entity) => {
    if (!entity.isValid) return [];
    if (entity.typeId === BEACH_CHAIR)
      return beachChairCells(
        beachChairPoseAt(entity.location, snapYaw4(entity.getRotation().y)),
      );
    const kind = furnitureKindOf(entity.typeId, "entity");
    if (kind === undefined) return [];
    return furnitureCells(
      furniturePoseAt(kind, entity.location, snapYaw4(entity.getRotation().y)),
    );
  });
}
