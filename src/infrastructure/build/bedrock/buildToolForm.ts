import type { Player, RawMessage } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { AIR, type BlockState } from "../../../domain/build/blockState";
import { BUILD_FORM } from "../identifiers";
import { resolveBlockState } from "./blockStates";
import type { BuildToolActions } from "./editActions";

const MENU = [
  "fill",
  "replace",
  "copy",
  "paste",
  "undo",
  "clearSelection",
] as const;

interface BlockChoice {
  state: BlockState;
  label: RawMessage;
}

function hotbarBlocks(player: Player): BlockChoice[] {
  const blocks: BlockChoice[] = [];
  const seen = new Set<string>([AIR.typeId]);
  const inventory = player.getComponent("minecraft:inventory")?.container;
  // The engine fixes the hotbar at nine slots, independently of build limits.
  for (let slot = 0; inventory && slot < Math.min(9, inventory.size); slot++) {
    const item = inventory.getItem(slot);
    if (!item || seen.has(item.typeId)) continue;
    try {
      blocks.push({
        state: resolveBlockState(item.typeId),
        label: { translate: item.localizationKey },
      });
      seen.add(item.typeId);
    } catch {
      // Tools and other non-block items do not resolve to block permutations.
    }
  }
  blocks.push({ state: AIR, label: { translate: BUILD_FORM.air } });
  return blocks;
}

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

async function showPatternForm(
  player: Player,
  actions: BuildToolActions,
  replacing: boolean,
): Promise<void> {
  const blocks = hotbarBlocks(player);
  const labels = blocks.map((b) => b.label);
  const form = new ModalFormData().title({
    translate: replacing ? BUILD_FORM.replace : BUILD_FORM.fill,
  });
  form.dropdown(
    { translate: replacing ? BUILD_FORM.replace : BUILD_FORM.block },
    labels,
  );
  if (replacing) form.dropdown({ translate: BUILD_FORM.with }, labels);
  const answer = await form
    .submitButton({ translate: BUILD_FORM.submit })
    .show(player);
  if (answer.canceled || !player.isValid) return;
  const chosen = (index: unknown) =>
    typeof index === "number" ? blocks[index]?.state : undefined;
  const from = chosen(answer.formValues?.[0]);
  if (!from) return;
  if (!replacing) return actions.fill({ state: from });
  const to = chosen(answer.formValues?.[1]);
  if (to) actions.replace({ typeId: from.typeId }, { state: to });
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
      return showPatternForm(player, actions, false);
    case "replace":
      return showPatternForm(player, actions, true);
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
