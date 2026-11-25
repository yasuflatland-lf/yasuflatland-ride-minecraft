import { ScriptEventSource, system } from "@minecraft/server";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { NAMESPACE } from "../../shared/identifiers";
import { TEST_EQUIPMENT_EVENT } from "./identifiers";
import { parseTestEquipmentMessage } from "./testEquipmentMessage";

// Lets in-game tests set an equipment switch without a player (ADR 0171).
export function registerTestEquipment(repo: VehicleRepository): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_EQUIPMENT_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const cmd = parseTestEquipmentMessage(ev.message);
      if (!cmd) {
        console.warn(`[${NAMESPACE}] ignored test tool: ${ev.message}`);
        return;
      }
      repo.get(cmd.vehicleId)?.forceEquipment(cmd.switch, cmd.state);
    },
    { namespaces: [NAMESPACE] },
  );
}
