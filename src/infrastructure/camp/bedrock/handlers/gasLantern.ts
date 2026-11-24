import { system, world } from "@minecraft/server";
import type { GasLanternActions } from "../../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../../domain/camp/spec";
import type { PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldTypeId } from "../../../shared/heldItem";
import { HEADLIGHT_SWITCH_TYPE } from "../../../shared/identifiers";
import {
  type PlaceHostedOnTop,
  registerHostedOnTop,
} from "../../../shared/tableTop/hosted";
import type { TopHostRegistry } from "../../../shared/tableTop/registry";
import { GAS_LANTERN_ITEM, GAS_LANTERN_TYPE } from "../../identifiers";
import type { BedrockGasLanternWorld } from "../bedrockGasLanternWorld";
import { registerPlaceableEntity } from "./placeable";

export function registerGasLantern(
  actions: GasLanternActions,
  lanternWorld: BedrockGasLanternWorld,
  registry: TopHostRegistry,
): PlaceHostedOnTop {
  system.runInterval(
    () => lanternWorld.relayLoaded(),
    GAS_LANTERN_SPEC.lightTicks,
  );
  const placements = new TickScopedSet<PlayerId>();
  const placeOnTop = registerHostedOnTop({
    itemId: GAS_LANTERN_ITEM,
    placeOnTop: (surface, cmd) => actions.placeOnTop(surface, cmd),
    registry,
    placements,
  });
  registerPlaceableEntity({
    itemId: GAS_LANTERN_ITEM,
    entityTypeIds: new Set([GAS_LANTERN_TYPE]),
    canUseBlock: (dimension, block, face) =>
      actions.canUseBlock(dimension, block, face),
    place: (ctx) => actions.place(ctx),
    hit: ({ entity, attacker, player, tick }) => {
      if (heldTypeId(attacker) === HEADLIGHT_SWITCH_TYPE) {
        actions.switch(asGasLanternId(entity.id), tick);
        return;
      }
      actions.hit(asGasLanternId(entity.id), player, tick);
    },
    placements,
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (placeOnTop(ev.player, ev.target, ev)) ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (
      ev.target.typeId !== GAS_LANTERN_TYPE ||
      ev.itemStack?.typeId === HEADLIGHT_SWITCH_TYPE
    )
      return;
    ev.cancel = true;
    const id = ev.target.id;
    system.run(() => actions.switch(asGasLanternId(id), system.currentTick));
  });
  return placeOnTop;
}
