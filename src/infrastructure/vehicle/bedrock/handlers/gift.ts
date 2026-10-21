// Opens a gift box. Using it in the air fires itemUse; using it on a block fires
// the block interaction, whose after-event never fires for an item with no use
// behavior on blocks (ADR 0024, 0093). The box does not stack, so when one tap
// fires both, the second use finds the slot empty.
import { system, world } from "@minecraft/server";
import type { OpenGift } from "../../../../application/vehicle/openGift";
import { asPlayerId } from "../../../../domain/shared/ids";
import { giftOfItem } from "../identifiers";

export function registerGifts(openGift: OpenGift): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    const gift = giftOfItem(ev.itemStack.typeId);
    if (gift === undefined) return;
    openGift.execute({
      playerId: asPlayerId(ev.source.id),
      gift,
      slot: ev.source.selectedSlotIndex,
    });
  });
  // Before-events cannot change the world, so the box opens on the next tick.
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const gift = giftOfItem(ev.itemStack?.typeId);
    if (!ev.isFirstEvent || gift === undefined) return;
    ev.cancel = true;
    const cmd = {
      playerId: asPlayerId(ev.player.id),
      gift,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => openGift.execute(cmd));
  });
}
