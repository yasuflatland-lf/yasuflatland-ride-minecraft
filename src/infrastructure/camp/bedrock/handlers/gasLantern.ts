import {
  Direction,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { GasLanternActions } from "../../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../../domain/camp/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
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

export function registerGasLantern(
  actions: GasLanternActions,
  lanternWorld: BedrockGasLanternWorld,
): void {
  system.runInterval(
    () => lanternWorld.relayLoaded(),
    GAS_LANTERN_SPEC.lightTicks,
  );
  const placements = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== GAS_LANTERN_ITEM) return;
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
    if (
      ev.target.typeId !== CAMP_TABLE_TYPE ||
      ev.itemStack?.typeId !== GAS_LANTERN_ITEM
    )
      return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    const table = ev.target.id;
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
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== GAS_LANTERN_TYPE
    )
      return;
    if (heldTypeId(ev.damagingEntity) === HEADLIGHT_SWITCH_TYPE) {
      actions.switch(asGasLanternId(ev.hitEntity.id), system.currentTick);
      return;
    }
    actions.hit(
      asGasLanternId(ev.hitEntity.id),
      asPlayerId(ev.damagingEntity.id),
      system.currentTick,
    );
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
