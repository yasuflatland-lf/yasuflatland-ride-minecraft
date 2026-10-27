import { Direction, Player, system, world } from "@minecraft/server";
import type { DutchOvenActions } from "../../../../application/camp/dutchOven";
import { asDutchOvenId } from "../../../../domain/camp/dutchOven";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import {
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  TEST_DUTCH_OVEN_HIT_EVENT,
  TEST_DUTCH_OVEN_SIMMER_EVENT,
} from "../../identifiers";

export function registerDutchOven(actions: DutchOvenActions): void {
  const placements = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== DUTCH_OVEN_ITEM) return;
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
    if (ev.target.typeId !== DUTCH_OVEN_TYPE) return;
    ev.cancel = true;
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== DUTCH_OVEN_TYPE
    )
      return;
    actions.hit(
      asDutchOvenId(ev.hitEntity.id),
      asPlayerId(ev.damagingEntity.id),
      system.currentTick,
    );
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (
      ev.id !== TEST_DUTCH_OVEN_SIMMER_EVENT &&
      ev.id !== TEST_DUTCH_OVEN_HIT_EVENT
    )
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== DUTCH_OVEN_TYPE) return;
    if (ev.id === TEST_DUTCH_OVEN_HIT_EVENT) {
      actions.hit(
        asDutchOvenId(entity.id),
        asPlayerId("test"),
        system.currentTick,
      );
    } else {
      entity.setProperty(
        DUTCH_OVEN_SIMMERING_PROPERTY,
        entity.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) !== true,
      );
    }
  });
  system.runInterval(() => {
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
      const dimension = world.getDimension(dimensionId);
      for (const oven of dimension.getEntities({ type: DUTCH_OVEN_TYPE })) {
        if (oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) !== true) continue;
        const at = oven.location;
        dimension.spawnParticle("minecraft:basic_smoke_particle", {
          x: at.x,
          y: at.y + 0.35,
          z: at.z,
        });
      }
    }
  }, 4);
}
