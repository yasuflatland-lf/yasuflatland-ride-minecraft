import {
  type Entity,
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { GasLanternActions } from "../../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldTypeId } from "../../../shared/heldItem";
import { HEADLIGHT_SWITCH_TYPE, id } from "../../../shared/identifiers";
import { showTopRefusal, topAim } from "../../../shared/tableTop/aim";
import type { PlaceHostedOnTop } from "../../../shared/tableTop/hosted";
import type { TopHostRegistry } from "../../../shared/tableTop/registry";
import {
  GAS_LANTERN_ITEM,
  GAS_LANTERN_TYPE,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
  TEST_GAS_LANTERN_ON_TABLE_EVENT,
} from "../../identifiers";
import type { BedrockGasLanternWorld } from "../bedrockGasLanternWorld";
import { testTableTopRequest } from "../tableTopAim";
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
      if (attacker && heldTypeId(attacker) === HEADLIGHT_SWITCH_TYPE) {
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
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === id("test_gas_lantern_on_top")) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const [hostType, ...parts] = ev.message.trim().split(/\s+/);
      const request = testTableTopRequest(parts.join(" "));
      if (!hostType || !request) return;
      const host = registry.host(hostType, request.table);
      if (host)
        actions.placeOnTop(host.type.surface, {
          hostType,
          host: request.table,
          aim: request.aim,
          slot: 0,
        });
      return;
    }
    if (ev.id === TEST_GAS_LANTERN_ON_TABLE_EVENT) {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const request = testTableTopRequest(ev.message);
      if (request) actions.placeOnTable({ ...request, slot: 0 });
      return;
    }
    if (
      (ev.id !== TEST_GAS_LANTERN_HIT_EVENT &&
        ev.id !== TEST_GAS_LANTERN_EVENT) ||
      ev.sourceType !== ScriptEventSource.Server
    )
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== GAS_LANTERN_TYPE) return;
    if (ev.id === TEST_GAS_LANTERN_EVENT) {
      actions.switch(asGasLanternId(entity.id), system.currentTick);
      return;
    }
    // The lantern id resolves to no player for action-bar hints.
    actions.hit(
      asGasLanternId(entity.id),
      asPlayerId(entity.id),
      system.currentTick,
    );
  });
  return (player, host) => place(player, host, heldTypeId(player));
}
