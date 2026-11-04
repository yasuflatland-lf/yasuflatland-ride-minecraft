import type { Entity, World } from "@minecraft/server";

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
