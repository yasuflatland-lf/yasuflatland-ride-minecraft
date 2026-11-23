import { ScriptEventSource, system, world } from "@minecraft/server";
import type { HitTable } from "../../../application/camp/hitTable";
import { asTableId } from "../../../domain/camp/table";
import { CAMP_TABLE_TYPE, TEST_TABLE_HIT_EVENT } from "../identifiers";

export function registerTestTable(hit: HitTable): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (
      ev.sourceType !== ScriptEventSource.Server ||
      ev.id !== TEST_TABLE_HIT_EVENT
    )
      return;
    const entity = world.getEntity(ev.message);
    if (entity?.typeId !== CAMP_TABLE_TYPE) return;
    hit.execute({ tableId: asTableId(entity.id), tick: system.currentTick });
  });
}
