import { system, world } from "@minecraft/server";
import type { DutchOvenActions } from "../../../../application/camp/dutchOven";
import type { HostedItemsGuard } from "../../../../application/shared/hostedItemsGuard";
import { asDutchOvenId } from "../../../../domain/camp/dutchOven";
import { asFirePitId } from "../../../../domain/camp/firePit";
import { DUTCH_OVEN_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { allDimensions } from "../../../shared/dimensions";
import {
  type PlaceHostedOnTop,
  registerHostedOnTop,
} from "../../../shared/tableTop/hosted";
import type { TopHostRegistry } from "../../../shared/tableTop/registry";
import {
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_TYPE,
} from "../../identifiers";
import { registerPlaceableEntity } from "./placeable";

export function registerDutchOven(
  actions: DutchOvenActions,
  hostedItems: HostedItemsGuard,
  registry: TopHostRegistry,
): PlaceHostedOnTop {
  const placements = new TickScopedSet<PlayerId>();
  const placeOnTop = registerHostedOnTop({
    itemId: DUTCH_OVEN_ITEM,
    placeOnTop: (surface, cmd) => actions.placeOnTop(surface, cmd),
    registry,
    placements,
  });
  registerPlaceableEntity({
    itemId: DUTCH_OVEN_ITEM,
    entityTypeIds: new Set([DUTCH_OVEN_TYPE]),
    canUseBlock: (dimension, block, face) =>
      actions.canUseBlock(dimension, block, face),
    place: (ctx) => actions.place(ctx),
    hit: ({ entity, player, tick }) =>
      actions.hit(asDutchOvenId(entity.id), player, tick),
    placements,
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (
      ev.target.typeId === FIRE_PIT_TYPE &&
      ev.itemStack?.typeId === DUTCH_OVEN_ITEM
    ) {
      ev.cancel = true;
      const player = asPlayerId(ev.player.id);
      if (!placements.add(system.currentTick, player)) return;
      const slot = ev.player.selectedSlotIndex;
      const pit = asFirePitId(ev.target.id);
      system.run(() => actions.placeOnFirePit({ player, pit, slot }));
      return;
    }
    if (placeOnTop(ev.player, ev.target, ev)) {
      ev.cancel = true;
      return;
    }
    if (ev.target.typeId !== DUTCH_OVEN_TYPE) return;
    ev.cancel = true;
    const id = ev.target.id;
    system.run(() => actions.toggleLid(asDutchOvenId(id), system.currentTick));
  });
  system.runInterval(() => {
    hostedItems.check();
    actions.uncoverEmptyFirePits();
  }, DUTCH_OVEN_SPEC.hostCheckTicks);
  system.runInterval(() => {
    for (const dimension of allDimensions()) {
      for (const oven of dimension.getEntities({ type: DUTCH_OVEN_TYPE })) {
        if (oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) !== true) continue;
        const at = oven.location;
        dimension.spawnParticle("minecraft:basic_bubble_particle", {
          x: at.x + (Math.random() - 0.5) * 0.2,
          y: at.y + 0.22,
          z: at.z + (Math.random() - 0.5) * 0.2,
        });
        dimension.spawnParticle("minecraft:basic_smoke_particle", {
          x: at.x,
          y: at.y + 0.35,
          z: at.z,
        });
      }
    }
  }, 4);
  return placeOnTop;
}
