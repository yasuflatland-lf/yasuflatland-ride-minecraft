import type { Dimension, Entity, World } from "@minecraft/server";
import type { Vec3 } from "../../domain/shared/vec";

/** The entity while it is loaded and its type is one of `typeIds`. */
export function entityOfType(
  world: Pick<World, "getEntity">,
  id: string,
  typeIds: string | { has(typeId: string): boolean },
): Entity | undefined {
  const entity = world.getEntity(id);
  if (!entity?.isValid) return undefined;
  const matches =
    typeof typeIds === "string"
      ? entity.typeId === typeIds
      : typeIds.has(entity.typeId);
  return matches ? entity : undefined;
}

/**
 * Spawns `typeId` at `at` turned to `yaw`, then runs `setup`. When the spawn or the setup
 * throws (an unloaded chunk can refuse either), removes the entity again and returns undefined.
 */
export function spawnWithRollback(
  dimension: Dimension,
  typeId: string,
  at: Vec3,
  yaw: number,
  setup?: (entity: Entity) => void,
): Entity | undefined {
  let entity: Entity | undefined;
  try {
    entity = dimension.spawnEntity(typeId, at);
    entity.setRotation({ x: 0, y: yaw });
    setup?.(entity);
    return entity;
  } catch {
    try {
      entity?.remove();
    } catch {
      // A chunk can unload between a failed spawn setter and its rollback.
    }
    return undefined;
  }
}
