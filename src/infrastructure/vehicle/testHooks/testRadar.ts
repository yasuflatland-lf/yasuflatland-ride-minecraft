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

const DRIVER_SLOT = 0;
const PASSENGER_SLOT = 1;

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
        (mode !== "start" && mode !== "message" && mode !== "passenger")
      )
        return;
      const vehicleId = asVehicleId(id);
      const vehicle = repo.get(vehicleId);
      const entity = index.entity(vehicleId);
      if (!vehicle || !entity || vehicle.driverId !== undefined) return;
      const rider = asPlayerId(`radar-${id}`);
      const yaw = entity.getRotation().y;
      // The live drive loop replaces synthetic riders with the real seats every tick.
      const occupied = new InMemoryVehicleRepository();
      occupied.save(
        rebuildVehicle(
          vehicle.kind,
          vehicleId,
          yaw,
          [
            {
              id: rider,
              slot: mode === "passenger" ? PASSENGER_SLOT : DRIVER_SLOT,
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
            recipient === rider ? { onScreenDisplay: display } : undefined,
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
            if (recipient === rider) result(JSON.stringify(report));
          },
        },
        occupied,
      );
      if (mode === "message") log.write(rider, "Test vehicle message");
      result("ready");
      const timer = system.runInterval(() => {
        if (entity.isValid) scan.execute();
        else system.clearRun(timer);
      }, SPEC.radarScanInterval);
    },
    { namespaces: [NAMESPACE] },
  );
}
