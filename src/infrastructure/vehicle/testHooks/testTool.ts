import { ScriptEventSource, system } from "@minecraft/server";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { NAMESPACE } from "../../shared/identifiers";
import { TEST_TOOL_EVENT } from "./identifiers";
import { parseTestToolMessage } from "./testToolMessage";

// Lets in-game tests set a monitor tool without a player (ADR 0171).
export function registerTestTool(repo: VehicleRepository): void {
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
      repo.get(cmd.vehicleId)?.forceTool(cmd.item, cmd.state);
    },
    { namespaces: [NAMESPACE] },
  );
}
