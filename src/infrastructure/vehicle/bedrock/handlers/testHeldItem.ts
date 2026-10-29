import { ScriptEventSource, system } from "@minecraft/server";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestHeldItemMessage } from "../../testInput/testHeldItemMessage";
import type { VehicleTestStore } from "../../testInput/vehicleTestStore";
import { TEST_HELD_ITEM_EVENT } from "../identifiers";

export function registerTestHeldItem(
  testHeldItems: VehicleTestStore<string>,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_HELD_ITEM_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const parsed = parseTestHeldItemMessage(ev.message);
      if (!parsed) {
        console.warn(`[${NAMESPACE}] ignored test held item: ${ev.message}`);
        return;
      }
      if (parsed.item !== undefined) {
        testHeldItems.set(parsed.vehicleId, parsed.item);
      } else {
        testHeldItems.clear(parsed.vehicleId);
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
