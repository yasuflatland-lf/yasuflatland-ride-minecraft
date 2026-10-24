import { ScriptEventSource, system } from "@minecraft/server";
import type { RawInput } from "../../../../domain/vehicle/driveInput";
import { NAMESPACE } from "../../../shared/identifiers";
import { parseTestInputMessage } from "../../testInput/testInputMessage";
import type { VehicleTestStore } from "../../testInput/vehicleTestStore";
import { TEST_INPUT_EVENT } from "../identifiers";

export function registerTestInput(
  testInputs: VehicleTestStore<RawInput>,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_INPUT_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const parsed = parseTestInputMessage(ev.message);
      if (!parsed) {
        console.warn(`[${NAMESPACE}] ignored test input: ${ev.message}`);
        return;
      }
      if (parsed.input !== undefined) {
        testInputs.set(parsed.vehicleId, parsed.input);
      } else {
        testInputs.clear(parsed.vehicleId);
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
