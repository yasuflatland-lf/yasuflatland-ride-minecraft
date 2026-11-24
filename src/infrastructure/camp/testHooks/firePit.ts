import { ScriptEventSource, system, world } from "@minecraft/server";
import type { FirePitActions } from "../../../application/camp/firePit";
import { asFirePitId } from "../../../domain/camp/firePit";
import { toggleFirePitWithItem } from "../bedrock/handlers/firePit";
import {
  FIRE_PIT_IGNITER_ITEM,
  FIRE_PIT_TYPE,
  TEST_FIRE_PIT_EVENT,
  TEST_FIRE_PIT_HIT_EVENT,
} from "../identifiers";

export function registerTestFirePit(actions: FirePitActions): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.sourceType !== ScriptEventSource.Server) return;
    if (ev.id !== TEST_FIRE_PIT_EVENT && ev.id !== TEST_FIRE_PIT_HIT_EVENT)
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== FIRE_PIT_TYPE) return;
    const id = asFirePitId(entity.id);
    if (ev.id === TEST_FIRE_PIT_HIT_EVENT) {
      actions.hit(id, undefined, system.currentTick);
    } else {
      toggleFirePitWithItem(actions, id, undefined, FIRE_PIT_IGNITER_ITEM, 0);
    }
  });
}
