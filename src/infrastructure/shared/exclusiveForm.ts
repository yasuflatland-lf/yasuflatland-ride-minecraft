import type { Player } from "@minecraft/server";
import { asPlayerId, type PlayerId } from "../../domain/shared/ids";

export function createExclusiveGuard(
  label: string,
): (player: Player, show: () => Promise<void>) => Promise<void> {
  const open = new Set<PlayerId>();
  return async (player, show) => {
    const id = asPlayerId(player.id);
    if (!player.isValid || open.has(id)) return;
    open.add(id);
    try {
      await show();
    } catch (error: unknown) {
      if (player.isValid) console.warn(`${label} failed: ${String(error)}`);
    } finally {
      open.delete(id);
    }
  };
}
