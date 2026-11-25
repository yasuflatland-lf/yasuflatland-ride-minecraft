import { ScriptEventSource, system } from "@minecraft/server";
import { ScanForPlaces } from "../../../application/vehicle/scanForPlaces";
import { asPlayerId, asVehicleId } from "../../../domain/shared/ids";
import { rebuildVehicle } from "../../../domain/vehicle/kinds/index";
import { SPEC } from "../../../domain/vehicle/spec";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { NAMESPACE } from "../../shared/identifiers";
import { ActionBarLog } from "../bedrock/actionBarLog";
import { BedrockRadarWorld } from "../bedrock/bedrockRadarWorld";
import type { EntityIndex } from "../bedrock/entityIndex";
import { InMemoryVehicleRepository } from "../persistence/inMemoryVehicleRepository";
import { TEST_RADAR_EVENT, TEST_RADAR_RESULT_EVENT } from "./identifiers";

export function registerTestRadar(
  repo: VehicleRepository,
  index: EntityIndex,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.id !== TEST_RADAR_EVENT ||
        ev.sourceType !== ScriptEventSource.Server
      )
        return;
      const [id, mode, extra] = ev.message.split(",");
      if (
        !id ||
        extra !== undefined ||
        (mode !== "start" && mode !== "message")
      )
        return;
      const vehicleId = asVehicleId(id);
      const vehicle = repo.get(vehicleId);
      const entity = index.entity(vehicleId);
      if (!vehicle || !entity || vehicle.driverId !== undefined) return;
      const driver = asPlayerId(`radar-${id}`);
      const yaw = entity.getRotation().y;
      // The live drive loop replaces synthetic riders with the real seats every tick.
      const driven = new InMemoryVehicleRepository();
      driven.save(
        rebuildVehicle(
          vehicle.kind,
          vehicleId,
          yaw,
          [
            {
              id: driver,
              slot: 0,
              offset: { x: 0, z: 0 },
              yaw,
              raw: { moveX: 0, moveY: 0, jump: false },
            },
          ],
          {},
        ),
      );
      const result = (payload: string) =>
        system.sendScriptEvent(
          TEST_RADAR_RESULT_EVENT,
          `${id},${system.currentTick},${payload}`,
        );
      const display = { setActionBar() {} };
      const log = new ActionBarLog(
        {
          player: (recipient) =>
            recipient === driver ? { onScreenDisplay: display } : undefined,
        },
        () => system.currentTick,
      );
      const world = new BedrockRadarWorld(index, log);
      const scan = new ScanForPlaces(
        {
          position: (vehicleId) => world.position(vehicleId),
          mobsNear: (...args) => world.mobsNear(...args),
          isQuiet: (recipient) => world.isQuiet(recipient),
          showReport(recipient, report) {
            world.showReport(recipient, report);
            if (recipient === driver) result(JSON.stringify(report));
          },
        },
        driven,
      );
      if (mode === "message") log.write(driver, "Test vehicle message");
      result("ready");
      const timer = system.runInterval(() => {
        if (entity.isValid) scan.execute();
        else system.clearRun(timer);
      }, SPEC.radarScanInterval);
    },
    { namespaces: [NAMESPACE] },
  );
}
