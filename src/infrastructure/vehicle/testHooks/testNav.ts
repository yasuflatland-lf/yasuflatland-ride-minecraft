import { ScriptEventSource, system, world } from "@minecraft/server";
import { NavSelections } from "../../../application/vehicle/navSelections";
import { OpenNav } from "../../../application/vehicle/openNav";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../domain/shared/ids";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { NAMESPACE } from "../../shared/identifiers";
import { TEST_NAV_EVENT, TEST_NAV_RESULT } from "./identifiers";
import { BOOST_RIDER_PROBE, tickBoostCrew } from "./testBoostCrew";

export function registerTestNav(repo: VehicleRepository): void {
  system.afterEvents.scriptEventReceive.subscribe(
    async (event) => {
      if (
        event.id !== TEST_NAV_EVENT ||
        event.sourceType !== ScriptEventSource.Server
      )
        return;
      const [vehicleId, passengerId] = event.message.split(",");
      if (!vehicleId || !passengerId) return;
      const entity = world.getEntity(vehicleId);
      const vehicle = repo.get(asVehicleId(vehicleId));
      if (!entity || vehicle?.kind !== "suv") return;
      const riders = entity.getComponent("minecraft:rideable")?.getRiders();
      if (
        riders?.length !== 2 ||
        riders[1]?.id !== passengerId ||
        riders.some((rider) => rider.typeId !== BOOST_RIDER_PROBE)
      )
        return;

      const actions: string[] = [];
      const nav = new OpenNav(
        repo,
        {
          dimensionOf: () => asDimensionId(entity.dimension.id),
          choose: async () => {
            actions.push("menu");
            return undefined;
          },
          giveMap: () => {
            actions.push("map");
            return "unknown";
          },
          showMessage: (_, name) => actions.push(name),
        },
        new NavSelections(),
      );
      const driver = tickBoostCrew(
        vehicle,
        entity,
        riders.map((rider) => rider.id),
      );
      try {
        if (driver !== riders[0]?.id)
          throw new Error("Crew probe has the wrong driver");
        await nav.execute({
          playerId: asPlayerId(passengerId),
          vehicleId: vehicle.id,
        });
        system.sendScriptEvent(
          TEST_NAV_RESULT,
          [vehicleId, ...actions].join(","),
        );
      } catch (error) {
        system.sendScriptEvent(
          TEST_NAV_RESULT,
          [vehicleId, String(error)].join(","),
        );
      } finally {
        vehicle.resync();
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
