import type { Player } from "@minecraft/server";
import type { RoofTentMenu } from "../../../../application/camp/roofTentMenu";
import type { RoofTentId } from "../../../../domain/camp/ids";
import { asPlayerId } from "../../../../domain/shared/ids";
import { chooseFromFormResult } from "../../../shared/choiceForm";
import { createExclusiveGuard } from "../../../shared/exclusiveForm";
import {
  ROOF_TENT_MENU_BUTTONS,
  ROOF_TENT_MENU_TITLE,
} from "../../identifiers";

export type RoofTentMenuResult =
  | "answered"
  | "dismissed"
  | "busy"
  | "unavailable";

export function createRoofTentMenu(
  menu: RoofTentMenu,
): (player: Player, tentId: RoofTentId) => Promise<RoofTentMenuResult> {
  const exclusive = createExclusiveGuard("Roof tent menu");
  return async (player, tentId) => {
    let result: RoofTentMenuResult = "unavailable";
    await exclusive(player, async () => {
      const answer = await chooseFromFormResult(
        player,
        ROOF_TENT_MENU_TITLE,
        menu
          .entries()
          .map((id) => ({ id, textKey: ROOF_TENT_MENU_BUTTONS[id] })),
      );
      if (answer.status !== "answered") {
        result =
          answer.status === "cancelled" || answer.status === "unanswered"
            ? "dismissed"
            : answer.status;
        return;
      }
      result = "answered";
      menu.choose({ playerId: asPlayerId(player.id), tentId }, answer.choice);
    });
    return result;
  };
}
