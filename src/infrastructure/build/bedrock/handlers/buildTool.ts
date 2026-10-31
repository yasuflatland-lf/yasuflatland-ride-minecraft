import { system, world } from "@minecraft/server";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { SwitchCooldowns } from "../../../../domain/shared/switchCooldown";
import { BUILD_TOOL_TYPE } from "../../identifiers";
import type { BuildMenus } from "../buildMenus";

export function registerBuildTool(menus: BuildMenus): void {
  const cooldowns = new SwitchCooldowns<PlayerId>();
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || itemStack.typeId !== BUILD_TOOL_TYPE) return;
    const id = asPlayerId(source.id);
    cooldowns.forgetIdle(system.currentTick);
    if (!cooldowns.tryUse(id, system.currentTick)) return;
    void menus.showUtilityMenu(source);
  });
}
