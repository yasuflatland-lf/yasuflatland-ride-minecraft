import { system, world } from "@minecraft/server";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { SwitchCooldowns } from "../../../../domain/shared/switchCooldown";
import { BUILD_TOOL_TYPE } from "../../identifiers";
import { showBuildToolForm } from "../buildToolForm";
import type { BuildToolActions } from "../editActions";

export function registerBuildTool(
  actions: (id: PlayerId) => BuildToolActions,
): void {
  const cooldowns = new SwitchCooldowns<PlayerId>();
  const open = new Set<PlayerId>();
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || itemStack.typeId !== BUILD_TOOL_TYPE) return;
    const id = asPlayerId(source.id);
    cooldowns.forgetIdle(system.currentTick);
    if (!cooldowns.tryUse(id, system.currentTick) || open.has(id)) return;
    open.add(id);
    void showBuildToolForm(source, actions(id))
      .catch((error: unknown) => {
        // A player may disconnect while the engine is opening a form.
        if (source.isValid)
          console.warn(`Build Tool form failed: ${String(error)}`);
      })
      .finally(() => open.delete(id));
  });
}
