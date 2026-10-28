import {
  BlockPermutation,
  type Player,
  type RawMessage,
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  AIR,
  type BlockState,
  blockStateOf,
} from "../../../domain/build/blockState";
import { BUILD_FORM } from "../identifiers";
import type { BuildToolActions } from "./editActions";

function hotbarBlocks(
  player: Player,
): { state: BlockState; label: RawMessage }[] {
  const blocks: { state: BlockState; label: RawMessage }[] = [];
  const seen = new Set<string>([AIR.typeId]);
  const inventory = player.getComponent("minecraft:inventory")?.container;
  // The engine fixes the hotbar at nine slots, independently of build limits.
  for (let slot = 0; inventory && slot < Math.min(9, inventory.size); slot++) {
    const item = inventory.getItem(slot);
    if (!item || seen.has(item.typeId)) continue;
    try {
      const permutation = BlockPermutation.resolve(item.typeId);
      blocks.push({
        state: blockStateOf(permutation.type.id, permutation.getAllStates()),
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

export async function showBuildToolForm(
  player: Player,
  actions: BuildToolActions,
): Promise<void> {
  const menu = new ActionFormData().title({ translate: BUILD_FORM.title });
  for (const key of [
    BUILD_FORM.fill,
    BUILD_FORM.replace,
    BUILD_FORM.copy,
    BUILD_FORM.paste,
    BUILD_FORM.undo,
    BUILD_FORM.clearSelection,
  ])
    menu.button({ translate: key });
  const choice = await menu.show(player);
  if (choice.canceled || !player.isValid) return;
  if (choice.selection === 2) return actions.copy();
  if (choice.selection === 4) return actions.undo();
  if (choice.selection === 5) return actions.clearSelection();
  if (choice.selection === 3) {
    const answer = await new ModalFormData()
      .title({ translate: BUILD_FORM.paste })
      .toggle({ translate: BUILD_FORM.skipAir }, { defaultValue: false })
      .submitButton({ translate: BUILD_FORM.submit })
      .show(player);
    if (
      !answer.canceled &&
      player.isValid &&
      typeof answer.formValues?.[0] === "boolean"
    )
      actions.paste(answer.formValues[0]);
    return;
  }
  if (choice.selection !== 0 && choice.selection !== 1) return;
  const blocks = hotbarBlocks(player);
  const labels = blocks.map((b) => b.label);
  const replacing = choice.selection === 1;
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
  const first = answer.formValues?.[0];
  const second = answer.formValues?.[1];
  const from = typeof first === "number" ? blocks[first]?.state : undefined;
  if (!from) return;
  if (!replacing) return actions.fill({ state: from });
  const to = typeof second === "number" ? blocks[second]?.state : undefined;
  if (to) actions.replace({ typeId: from.typeId }, { state: to });
}
