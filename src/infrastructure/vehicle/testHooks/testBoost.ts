import { ScriptEventSource, system, world } from "@minecraft/server";
import { SwitchBoost } from "../../../application/vehicle/switchBoost";
import { SwitchFeedback } from "../../../application/vehicle/switchFeedback";
import {
  asPlayerId,
  asVehicleId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { BOOST_CONTROL } from "../../../domain/vehicle/boost";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { NAMESPACE } from "../../shared/identifiers";
import { TEST_BOOST_EVENT, TEST_BOOST_RESULT_EVENT } from "./identifiers";
import { tickBoostCrew } from "./testBoostCrew";

export function registerTestBoost(repo: VehicleRepository): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_BOOST_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const [id, state, arg, extra] = ev.message.split(",");
      const withDriver =
        (state === "use" || state === "seat") && arg === undefined;
      const set =
        (state === "on" || state === "off") &&
        (arg === undefined || arg === "report");
      if (!id || extra !== undefined || (!withDriver && !set)) {
        console.warn(`[${NAMESPACE}] ignored test boost: ${ev.message}`);
        return;
      }
      const vehicleId = asVehicleId(id);
      const vehicle = repo.get(vehicleId);
      if (!vehicle) return;
      if (withDriver) {
        const entity = world.getEntity(id);
        if (!entity) return;
        const playerId = asPlayerId("test-boat-driver");
        const driver = tickBoostCrew(vehicle, entity, [playerId]);
        vehicle.resync();
        if (driver !== playerId) return;
        if (state === "seat") {
          system.sendScriptEvent(TEST_BOOST_RESULT_EVENT, `${id},ready`);
          return;
        }
        // Capture the message sent to the probe, which has no player HUD.
        const messages = {
          showMessage: (recipient: PlayerId, name: string) => {
            if (recipient === playerId)
              system.sendScriptEvent(TEST_BOOST_RESULT_EVENT, `${id},${name}`);
          },
        };
        new SwitchBoost(
          repo,
          { now: () => system.currentTick },
          new SwitchFeedback(messages, { isThirdPerson: () => false }),
          messages,
        ).execute({ vehicleId, playerId });
        return;
      }
      const control = vehicle.capability(BOOST_CONTROL);
      if (control && control.isOn() !== (state === "on")) control.toggle();
      if (arg === "report" && control)
        system.sendScriptEvent(
          TEST_BOOST_RESULT_EVENT,
          `${id},${control.isOn() ? "on" : "off"}`,
        );
    },
    { namespaces: [NAMESPACE] },
  );
}
