import type { Player } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";

type ChoiceEntry<Id extends string = string> = Readonly<{
  id: Id;
  textKey: string;
}>;
const CANCELLED = "cancel" as const;

type ChoiceFormResult<Id extends string> =
  | { status: "answered"; choice: Id }
  | { status: "cancelled" | "busy" | "unavailable" | "unanswered" };

export async function chooseFromForm<Id extends string>(
  player: Player,
  titleKey: string,
  entries: readonly ChoiceEntry<Id>[],
): Promise<Id | typeof CANCELLED | undefined> {
  const result = await chooseFromFormResult(player, titleKey, entries);
  if (result.status === "answered") return result.choice;
  if (result.status === "busy" || result.status === "cancelled")
    return CANCELLED;
  return undefined;
}

export async function chooseFromFormResult<Id extends string>(
  player: Player,
  titleKey: string,
  entries: readonly ChoiceEntry<Id>[],
): Promise<ChoiceFormResult<Id>> {
  if (entries.length === 0) return { status: "unavailable" };
  const form = new ActionFormData().title({ translate: titleKey });
  for (const entry of entries) form.button({ translate: entry.textKey });
  const answer = await form.show(player);
  if (!player.isValid) return { status: "unavailable" };
  if (answer.cancelationReason === FormCancelationReason.UserBusy)
    return { status: "busy" };
  if (answer.canceled || answer.cancelationReason !== undefined)
    return { status: "cancelled" };
  const choice =
    answer.selection === undefined ? undefined : entries[answer.selection]?.id;
  return choice === undefined
    ? { status: "unanswered" }
    : { status: "answered", choice };
}
