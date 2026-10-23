import { ScriptEventSource, system } from "@minecraft/server";
import type { SwitchBlade } from "../../../../application/vehicle/switchBlade";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestBladeMessage } from "../../testInput/testBladeMessage";
import { TEST_BLADE_EVENT } from "../identifiers";

// Lets in-game tests set a bulldozer's blade without a player (ADR 0138).
export function registerTestBlade(blade: SwitchBlade): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_BLADE_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const cmd = parseTestBladeMessage(ev.message);
      if (!cmd) {
        console.warn(`[${NAMESPACE}] ignored test blade: ${ev.message}`);
        return;
      }
      blade.force(cmd);
    },
    { namespaces: [NAMESPACE] },
  );
}
