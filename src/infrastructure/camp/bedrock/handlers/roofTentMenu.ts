import type { Player } from "@minecraft/server";
import type { RoofTentMenu } from "../../../../application/camp/roofTentMenu";
import { asPlayerId } from "../../../../domain/shared/ids";
import { chooseFromForm } from "../../../shared/choiceForm";
import { createExclusiveGuard } from "../../../shared/exclusiveForm";
import {
  ROOF_TENT_MENU_BUTTONS,
  ROOF_TENT_MENU_TITLE,
} from "../../identifiers";

export function createRoofTentMenu(
  menu: RoofTentMenu,
): (player: Player, tentId: string) => Promise<void> {
  const exclusive = createExclusiveGuard("Roof tent menu");
  return (player, tentId) =>
    exclusive(player, async () => {
      const choice = await chooseFromForm(
        player,
        ROOF_TENT_MENU_TITLE,
        menu
          .entries()
          .map((id) => ({ id, textKey: ROOF_TENT_MENU_BUTTONS[id] })),
      );
      if (choice === undefined || choice === "cancel") return;
      menu.choose({ playerId: asPlayerId(player.id), tentId }, choice);
    });
}
