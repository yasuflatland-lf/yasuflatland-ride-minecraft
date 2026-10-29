import type { Entity } from "@minecraft/server";
import { isVehicleEntity } from "./identifiers";

/** The add-on vehicle `player` rides, or undefined on foot or on any other mount. */
export function riddenVehicle(player: Entity): Entity | undefined {
  const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
  return isVehicleEntity(mount?.typeId) ? mount : undefined;
}
