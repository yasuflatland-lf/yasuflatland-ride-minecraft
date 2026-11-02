import type { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

type ChoiceEntry<Id extends string = string> = Readonly<{
  id: Id;
  textKey: string;
}>;
const CANCELLED = "cancel" as const;

/** Keeps ActionFormData construction shared across infrastructure features. */
export async function chooseFromForm<Id extends string>(
  player: Player,
  titleKey: string,
  entries: readonly ChoiceEntry<Id>[],
): Promise<Id | typeof CANCELLED | undefined> {
  if (entries.length === 0) return undefined;
  const form = new ActionFormData().title({ translate: titleKey });
  for (const entry of entries) form.button({ translate: entry.textKey });
  const answer = await form.show(player);
  if (!player.isValid) return undefined;
  if (answer.canceled || answer.cancelationReason !== undefined)
    return CANCELLED;
  return answer.selection === undefined
    ? undefined
    : entries[answer.selection]?.id;
}
