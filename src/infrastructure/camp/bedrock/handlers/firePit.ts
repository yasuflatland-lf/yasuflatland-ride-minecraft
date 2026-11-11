import { ScriptEventSource, system, world } from "@minecraft/server";
import type { FirePitActions } from "../../../../application/camp/firePit";
import type { FirePitWorld } from "../../../../application/camp/ports/firePit";
import { asFirePitId } from "../../../../domain/camp/firePit";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { allDimensions } from "../../../shared/dimensions";
import {
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
  TEST_FIRE_PIT_COVER_EVENT,
  TEST_FIRE_PIT_EVENT,
  TEST_FIRE_PIT_HIT_EVENT,
} from "../../identifiers";
import { registerPlaceableEntity } from "./placeable";

export function registerFirePit(
  actions: FirePitActions,
  firePitWorld: FirePitWorld,
): void {
  const interactions = new TickScopedSet<PlayerId>();
  registerPlaceableEntity({
    itemId: FIRE_PIT_ITEM,
    entityTypeIds: new Set([FIRE_PIT_TYPE]),
    canUseBlock: (dimension, block, face) =>
      actions.canUseBlock(dimension, block, face),
    place: (ctx) => actions.place(ctx),
    hit: ({ entity, player, tick }) =>
      actions.hit(asFirePitId(entity.id), player, tick),
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.cancel || ev.target.typeId !== FIRE_PIT_TYPE) return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!interactions.add(system.currentTick, player)) return;
    const id = asFirePitId(ev.target.id);
    const held = ev.itemStack?.typeId;
    const slot = ev.player.selectedSlotIndex;
    system.run(() => actions.toggle(id, player, held, slot));
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (
      ev.id !== TEST_FIRE_PIT_EVENT &&
      ev.id !== TEST_FIRE_PIT_COVER_EVENT &&
      ev.id !== TEST_FIRE_PIT_HIT_EVENT
    )
      return;
    if (ev.sourceType !== ScriptEventSource.Server) return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== FIRE_PIT_TYPE) return;
    const id = asFirePitId(entity.id);
    if (ev.id === TEST_FIRE_PIT_COVER_EVENT) {
      firePitWorld.setCovered(id, !firePitWorld.isCovered(id));
    } else if (ev.id === TEST_FIRE_PIT_HIT_EVENT) {
      // The pit is a valid entity id but resolves to no player for action-bar hints.
      actions.hit(id, asPlayerId(entity.id), system.currentTick);
    } else {
      actions.toggle(id, undefined, "minecraft:flint_and_steel", 0);
    }
  });
  system.runInterval(() => {
    for (const dimension of allDimensions()) {
      for (const pit of dimension.getEntities({ type: FIRE_PIT_TYPE })) {
        if (pit.getProperty(FIRE_PIT_LIT_PROPERTY) !== true) continue;
        const at = pit.location;
        dimension.spawnParticle("minecraft:basic_flame_particle", {
          x: at.x - 0.17,
          y: at.y + 0.63,
          z: at.z,
        });
        dimension.spawnParticle("minecraft:basic_flame_particle", {
          x: at.x + 0.15,
          y: at.y + 0.75,
          z: at.z + 0.08,
        });
        dimension.spawnParticle("minecraft:basic_smoke_particle", {
          x: at.x,
          y: at.y + 0.97,
          z: at.z,
        });
      }
    }
  }, 4);
}
