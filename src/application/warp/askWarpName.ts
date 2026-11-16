import type { PlayerId } from "../../domain/shared/ids";
import { WARP_SPEC } from "../../domain/warp/spec";
import { parseWarpName, type WarpName } from "../../domain/warp/warpName";
import type { WarpMenus } from "./ports/menus";
import type { WarpTicks } from "./ports/ticks";

export async function askWarpName(
  menus: WarpMenus,
  ticks: WarpTicks,
  playerId: PlayerId,
  current?: WarpName,
): Promise<WarpName | undefined> {
  for (let retries = 0; ; retries++) {
    const answer = await menus.askName(playerId, current);
    if (answer.kind === "name") return parseWarpName(answer.name);
    if (answer.kind === "cancelled" || retries >= WARP_SPEC.formMaxRetries)
      return undefined;
    await ticks.wait(WARP_SPEC.formRetryTicks);
  }
}
