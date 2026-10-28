import { ScriptEventSource, system } from "@minecraft/server";
import type { SwitchTool } from "../../../../application/vehicle/switchTool";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestToolMessage } from "../../testInput/testToolMessage";
import { TEST_TOOL_EVENT } from "../identifiers";

// Lets in-game tests set a monitor tool without a player (ADR 0171).
export function registerTestTool(tool: SwitchTool): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_TOOL_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const cmd = parseTestToolMessage(ev.message);
      if (!cmd) {
        console.warn(`[${NAMESPACE}] ignored test tool: ${ev.message}`);
        return;
      }
      tool.force(cmd);
    },
    { namespaces: [NAMESPACE] },
  );
}
