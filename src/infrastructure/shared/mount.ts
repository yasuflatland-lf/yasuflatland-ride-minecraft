import type { Entity } from "@minecraft/server";

/** The entity rider sits on, or undefined when it is on foot or the engine cannot read the mount. */
export function mountOf(rider: Entity): Entity | undefined {
  try {
    return rider.getComponent("minecraft:riding")?.entityRidingOn;
  } catch {
    // The engine getter throws for a removed mount.
    return undefined;
  }
}
