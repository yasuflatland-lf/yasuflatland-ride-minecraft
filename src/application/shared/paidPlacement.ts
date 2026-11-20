import type { PlayerId } from "../../domain/shared/ids";
import type { ItemPayment } from "./ports/itemPayment";

export interface Payer {
  /** Undefined for a server test hook, which pays nothing (ADR 0010). */
  readonly player: PlayerId | undefined;
  readonly slot: number;
}

export type PaidPlacement<Id> =
  | { readonly placed: true; readonly id: Id }
  | { readonly placed: false; readonly reason: "unpaid" | "spawnFailed" };

/**
 * Takes the item first, outside Creative, so a player who moved it meanwhile gets
 * nothing instead of the thing and the item (ADR 0024). Then spawns, and refunds a
 * taken item when `spawn` returns undefined.
 */
export function placePaid<Id>(
  payment: ItemPayment,
  { player, slot }: Payer,
  spawn: () => Id | undefined,
): PaidPlacement<Id> {
  const owesPayment = player !== undefined && !payment.isCreative(player);
  if (owesPayment && !payment.consumeItem(player, slot))
    return { placed: false, reason: "unpaid" };

  const id = spawn();
  if (id !== undefined) return { placed: true, id };

  if (owesPayment) payment.refund(player, slot);
  return { placed: false, reason: "spawnFailed" };
}
