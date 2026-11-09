import { type Player, system, world } from "@minecraft/server";
import type { BeachChairMenu } from "../../../../application/resort/beachChairMenu";
import type { SwitchBeachChairForm } from "../../../../application/resort/switchBeachChairForm";
import { CHAIR_MENU_CHOICES } from "../../../../domain/resort/beachChair";
import { asBeachChairId } from "../../../../domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { chooseFromFormResult } from "../../../shared/choiceForm";
import { heldDye } from "../../../shared/dyes";
import { createExclusiveGuard } from "../../../shared/exclusiveForm";
import { id } from "../../../shared/identifiers";
import { BEACH_CHAIR, BEACH_CHAIR_FOLDED } from "../../identifiers";

export function registerBeachChairInteraction(
  form: SwitchBeachChairForm,
  menu: BeachChairMenu,
): void {
  const exclusive = createExclusiveGuard("Beach chair menu");
  const requested = new TickScopedSet<PlayerId>();
  const show = async (player: Player, chair: string) => {
    await exclusive(player, async () => {
      const answer = await chooseFromFormResult(
        player,
        "yasu_ride.beach_chair.menu.title",
        CHAIR_MENU_CHOICES.map((choice) => ({
          id: choice,
          textKey: `yasu_ride.beach_chair.menu.${choice}`,
        })),
      );
      if (answer.status === "answered")
        menu.choose(answer.choice, {
          id: asBeachChairId(chair),
          player: asPlayerId(player.id),
        });
    });
  };
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== BEACH_CHAIR || heldDye(ev.player)) return;
    const folded = ev.target.getProperty(BEACH_CHAIR_FOLDED) === true;
    if (folded) {
      const item = ev.player
        .getComponent("minecraft:inventory")
        ?.container?.getItem(ev.player.selectedSlotIndex);
      if (
        item?.typeId === id("gas_lantern_item") ||
        item?.typeId === id("dutch_oven_item")
      )
        return;
    }
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, player)) return;
    const chair = asBeachChairId(ev.target.id);
    system.run(() => {
      if (folded) form.unfold({ id: chair, player });
      else void show(ev.player, chair);
    });
  });
}
