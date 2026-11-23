import { type Entity, type Player, system, world } from "@minecraft/server";
import type { GasLanternActions } from "../../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldTypeId } from "../../../shared/heldItem";
import { HEADLIGHT_SWITCH_TYPE } from "../../../shared/identifiers";
import { showTopRefusal, topAim } from "../../../shared/tableTop/aim";
import type { PlaceHostedOnTop } from "../../../shared/tableTop/hosted";
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
  const place = (
    placer: Player,
    host: Entity,
    held: string | undefined,
  ): boolean => {
    if (held !== GAS_LANTERN_ITEM) return false;
    const type = registry.hostTypeOf(host);
    if (!type) return false;
    const player = asPlayerId(placer.id);
    if (!placements.add(system.currentTick, player)) return true;
    const slot = placer.selectedSlotIndex;
    const aim = topAim(placer, host, type.surface);
    const id = host.id;
    system.run(() =>
      showTopRefusal(
        placer,
        type,
        actions.placeOnTop(type.surface, {
          player,
          hostType: type.hostType,
          host: id,
          slot,
          aim,
        }),
      ),
    );
    return true;
  };
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
    if (place(ev.player, ev.target, ev.itemStack?.typeId)) ev.cancel = true;
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
  return (player, host) => place(player, host, heldTypeId(player));
}
