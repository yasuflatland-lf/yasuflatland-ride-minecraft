import { system, world } from "@minecraft/server";
import type { FirePitActions } from "../../../../application/camp/firePit";
import { asFirePitId, type FirePitId } from "../../../../domain/camp/firePit";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { allDimensions } from "../../../shared/dimensions";
import {
  FIRE_PIT_IGNITER_ITEM,
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
} from "../../identifiers";
import { registerPlaceableEntity } from "./placeable";

export function toggleFirePitWithItem(
  actions: FirePitActions,
  id: FirePitId,
  player: PlayerId | undefined,
  heldItem: string | undefined,
  slot: number,
): void {
  actions.toggle(id, player, heldItem === FIRE_PIT_IGNITER_ITEM, slot);
}

export function registerFirePit(actions: FirePitActions): void {
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
    system.run(() => toggleFirePitWithItem(actions, id, player, held, slot));
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
