import { BlockTypes, type Player, system, world } from "@minecraft/server";
import type { BeachChairMenu } from "../../../../application/resort/beachChairMenu";
import type { SwitchBeachChairForm } from "../../../../application/resort/switchBeachChairForm";
import { CHAIR_MENU_CHOICES } from "../../../../domain/resort/beachChair";
import { asBeachChairId } from "../../../../domain/resort/ids";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { chooseFromFormResult } from "../../../shared/choiceForm";
import { heldDye } from "../../../shared/dyes";
import { createExclusiveGuard } from "../../../shared/exclusiveForm";
import { id } from "../../../shared/identifiers";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_TOP,
} from "../../identifiers";
import type { BedrockBeachChairWorld } from "../bedrockBeachChairWorld";

export function registerBeachChairInteraction(
  adapter: BedrockBeachChairWorld,
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
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, player)) return;
    const chair = asBeachChairId(ev.target.id);
    const folded = ev.target.getProperty(BEACH_CHAIR_FOLDED) === true;
    system.run(() => {
      if (folded) form.unfold({ id: chair, player });
      else void show(ev.player, chair);
    });
  });
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(BEACH_CHAIR_TOP, {
      onPlayerInteract: (ev) => {
        const player = ev.player;
        if (!player) return;
        const item = player
          .getComponent("minecraft:inventory")
          ?.container?.getItem(player.selectedSlotIndex);
        if (
          item &&
          (item.typeId === id("gas_lantern_item") ||
            item.typeId === id("dutch_oven_item") ||
            BlockTypes.get(item.typeId))
        )
          return;
        const owner = adapter.topOwner(
          asDimensionId(ev.dimension.id),
          ev.block.location,
          ev.block.typeId,
        );
        if (owner === undefined) return;
        const playerId = asPlayerId(player.id);
        if (!requested.add(system.currentTick, playerId)) return;
        form.unfold({ id: asBeachChairId(owner), player: playerId });
      },
    });
  });
}
