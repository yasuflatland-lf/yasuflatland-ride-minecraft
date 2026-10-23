import {
  type Entity,
  EntityInitializationCause,
  world,
} from "@minecraft/server";

export function registerCutDrops(sweep: (entity: Entity) => void): void {
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause !== EntityInitializationCause.Loaded) sweep(ev.entity);
  });
}
