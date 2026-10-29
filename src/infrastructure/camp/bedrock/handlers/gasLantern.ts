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
  GAS_LANTERN_ITEM,
  GAS_LANTERN_TYPE,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
} from "../../identifiers";
import type { BedrockGasLanternWorld } from "../bedrockGasLanternWorld";

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
