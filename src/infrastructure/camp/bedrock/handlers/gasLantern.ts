import { ScriptEventSource, system, world } from "@minecraft/server";
import type { GasLanternActions } from "../../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../../domain/camp/spec";
import { asTableId } from "../../../../domain/camp/table";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldTypeId } from "../../../shared/heldItem";
import { HEADLIGHT_SWITCH_TYPE } from "../../../shared/identifiers";
import {
  CAMP_TABLE_TYPE,
  GAS_LANTERN_ITEM,
  GAS_LANTERN_TYPE,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
  TEST_GAS_LANTERN_ON_TABLE_EVENT,
} from "../../identifiers";
import type { BedrockGasLanternWorld } from "../bedrockGasLanternWorld";
import {
  showTableTopRefusal,
  tableTopAim,
  testTableTopRequest,
} from "../tableTopAim";
import { registerPlaceableEntity } from "./placeable";

export function registerGasLantern(
  actions: GasLanternActions,
  lanternWorld: BedrockGasLanternWorld,
): void {
  system.runInterval(
    () => lanternWorld.relayLoaded(),
    GAS_LANTERN_SPEC.lightTicks,
  );
  const placements = new TickScopedSet<PlayerId>();
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
    if (
      ev.target.typeId !== CAMP_TABLE_TYPE ||
      ev.itemStack?.typeId !== GAS_LANTERN_ITEM
    )
      return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    const table = asTableId(ev.target.id);
    const slot = ev.player.selectedSlotIndex;
    const aim = tableTopAim(ev.player, ev.target);
    const placer = ev.player;
    system.run(() =>
      showTableTopRefusal(
        placer,
        actions.placeOnTable({ player, table, slot, aim }),
      ),
    );
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
}
