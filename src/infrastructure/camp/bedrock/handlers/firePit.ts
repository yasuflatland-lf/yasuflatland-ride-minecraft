import {
  Direction,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { FirePitActions } from "../../../../application/camp/firePit";
import type { FirePitWorld } from "../../../../application/camp/ports/firePit";
import { asFirePitId } from "../../../../domain/camp/firePit";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import {
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
  TEST_FIRE_PIT_COVER_EVENT,
  TEST_FIRE_PIT_EVENT,
  TEST_FIRE_PIT_HIT_EVENT,
} from "../../identifiers";

export function registerFirePit(
  actions: FirePitActions,
  firePitWorld: FirePitWorld,
): void {
  const placements = new TickScopedSet<PlayerId>();
  const interactions = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== FIRE_PIT_ITEM) return;
    const dimension = asDimensionId(ev.block.dimension.id);
    const block = ev.block.location;
    if (
      !actions.canUseBlock(
        dimension,
        block,
        ev.blockFace === Direction.Up ? "up" : "other",
      )
    )
      return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    const yaw = ev.player.getRotation().y;
    const slot = ev.player.selectedSlotIndex;
    system.run(() => actions.place({ player, dimension, block, yaw, slot }));
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
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== FIRE_PIT_TYPE
    )
      return;
    actions.hit(
      asFirePitId(ev.hitEntity.id),
      asPlayerId(ev.damagingEntity.id),
      system.currentTick,
    );
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
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
      const dimension = world.getDimension(dimensionId);
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
