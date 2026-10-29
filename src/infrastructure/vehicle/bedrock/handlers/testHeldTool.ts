import { ScriptEventSource, system } from "@minecraft/server";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestHeldToolMessage } from "../../testInput/testHeldToolMessage";
import type { VehicleTestStore } from "../../testInput/vehicleTestStore";
import { TEST_HELD_TOOL_EVENT } from "../identifiers";

export function registerTestHeldTool(
  testTools: VehicleTestStore<string>,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_HELD_TOOL_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const parsed = parseTestHeldToolMessage(ev.message);
      if (!parsed) {
        console.warn(`[${NAMESPACE}] ignored test held tool: ${ev.message}`);
        return;
      }
      if (parsed.item !== undefined) {
        testTools.set(parsed.vehicleId, parsed.item);
      } else {
        testTools.clear(parsed.vehicleId);
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
