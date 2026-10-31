import type { Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { BUILD_FORM } from "../identifiers";
import type { BuildToolActions } from "./editActions";

const MENU = ["fill", "copy", "paste", "undo", "clearSelection"] as const;

async function showPasteForm(
  player: Player,
  actions: BuildToolActions,
): Promise<void> {
  const answer = await new ModalFormData()
    .title({ translate: BUILD_FORM.paste })
    .toggle({ translate: BUILD_FORM.skipAir }, { defaultValue: false })
    .submitButton({ translate: BUILD_FORM.submit })
    .show(player);
  if (answer.canceled || !player.isValid) return;
  const skipAir = answer.formValues?.[0];
  if (typeof skipAir === "boolean") actions.paste(skipAir);
}

export async function showBuildToolForm(
  player: Player,
  actions: BuildToolActions,
): Promise<void> {
  const menu = new ActionFormData().title({ translate: BUILD_FORM.title });
  for (const entry of MENU) menu.button({ translate: BUILD_FORM[entry] });
  const choice = await menu.show(player);
  if (choice.canceled || !player.isValid || choice.selection === undefined)
    return;
  switch (MENU[choice.selection]) {
    case "fill":
      return actions.fill();
    case "copy":
      return actions.copy();
    case "paste":
      return showPasteForm(player, actions);
    case "undo":
      return actions.undo();
    case "clearSelection":
      return actions.clearSelection();
  }
}
