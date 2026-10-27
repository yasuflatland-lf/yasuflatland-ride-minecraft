import {
  Direction,
  Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { HitTable } from "../../../../application/camp/hitTable";
import type { PlaceTable } from "../../../../application/camp/placeTable";
import { asTableId } from "../../../../domain/camp/table";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import {
  CAMP_TABLE_ITEM,
  CAMP_TABLE_TYPE,
  TEST_TABLE_HIT_EVENT,
} from "../../identifiers";

export function registerTable(place: PlaceTable, hit: HitTable): void {
  const requested = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== CAMP_TABLE_ITEM) return;
    const dimensionId = asDimensionId(ev.block.dimension.id);
    const block = ev.block.location;
    if (
      !place.canUseBlock(
        dimensionId,
        block,
        ev.blockFace === Direction.Up ? "up" : "other",
      )
    )
      return;
    ev.cancel = true;
    const playerId = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, playerId)) return;
    const yaw = ev.player.getRotation().y;
    const slot = ev.player.selectedSlotIndex;
    system.run(() =>
      place.execute({ playerId, dimensionId, blockLocation: block, yaw, slot }),
    );
  });
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (
      ev.id !== TEST_TABLE_HIT_EVENT ||
      ev.sourceType !== ScriptEventSource.Server
    )
      return;
    const table = world.getEntity(ev.message);
    if (table?.typeId !== CAMP_TABLE_TYPE) return;
    hit.execute({
      tableId: asTableId(table.id),
      playerId: asPlayerId("test"),
      tick: system.currentTick,
    });
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== CAMP_TABLE_TYPE
    )
      return;
    hit.execute({
      tableId: asTableId(ev.hitEntity.id),
      tick: system.currentTick,
      playerId: asPlayerId(ev.damagingEntity.id),
    });
  });
}
