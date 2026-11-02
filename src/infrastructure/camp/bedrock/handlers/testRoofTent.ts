import { ScriptEventSource, system, world } from "@minecraft/server";
import type { FoldRoofTent } from "../../../../application/camp/foldRoofTent";
import type { PlaceRoofTent } from "../../../../application/camp/placeRoofTent";
import type { RoofTentHostGuard } from "../../../../application/camp/roofTentHostGuard";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import { NAMESPACE } from "../../../shared/identifiers";
import {
  TEST_ROOF_TENT_DRIVER_SEAT_EVENT,
  TEST_ROOF_TENT_HIT_EVENT,
  TEST_ROOF_TENT_HOST_REMOVE_EVENT,
  TEST_ROOF_TENT_OCCUPANT_SEAT_EVENT,
  TEST_ROOF_TENT_PLACE_EVENT,
} from "../../identifiers";
import type { BedrockRoofTentOccupantWorld } from "../bedrockRoofTentOccupantWorld";
import { roofTentEntity } from "../bedrockRoofTentWorld";
import type { RoofTentHosts } from "../roofTentHosts";

export function registerTestRoofTent(
  place: PlaceRoofTent,
  fold: FoldRoofTent,
  guard: RoofTentHostGuard,
  occupants: BedrockRoofTentOccupantWorld,
  hosts: RoofTentHosts,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      const parts = ev.message.trim().split(/\s+/);
      const [id, riderId] = parts;
      if (!id) return;
      if (ev.id === TEST_ROOF_TENT_PLACE_EVENT) {
        const values = parts.map(Number);
        const [x, y, z, yaw] = values;
        if (
          parts.length === 4 &&
          x !== undefined &&
          y !== undefined &&
          z !== undefined &&
          yaw !== undefined &&
          [x, y, z].every(Number.isInteger) &&
          Number.isFinite(yaw)
        ) {
          place.execute({
            dimensionId: asDimensionId("minecraft:overworld"),
            target: { clicked: { x, y, z } },
            yaw,
            slot: 0,
          });
        } else if (
          parts.length === 1 &&
          hosts.lookup(id).status === "present"
        ) {
          place.execute({
            dimensionId: asDimensionId("minecraft:overworld"),
            target: { entityId: id },
            yaw: 0,
            slot: 0,
          });
        }
      } else if (
        ev.id === TEST_ROOF_TENT_HIT_EVENT &&
        parts.length === 1 &&
        roofTentEntity(id)
      ) {
        fold.execute({ tentId: id, tick: system.currentTick });
      } else if (
        ev.id === TEST_ROOF_TENT_HOST_REMOVE_EVENT &&
        parts.length === 1 &&
        hosts.lookup(id).status === "present"
      ) {
        world.getEntity(id)?.remove();
        // Lifecycle bookkeeping probes the host area in the deferred callback.
        system.run(() => guard.check());
      } else if (
        ev.id === TEST_ROOF_TENT_OCCUPANT_SEAT_EVENT &&
        parts.length === 2 &&
        riderId &&
        roofTentEntity(id)
      ) {
        const rider = world.getEntity(riderId);
        if (!rider?.isValid) return;
        occupants.setOccupant(id, asPlayerId(riderId));
        occupants.moveInside(asPlayerId(riderId), id);
      } else if (
        ev.id === TEST_ROOF_TENT_DRIVER_SEAT_EVENT &&
        parts.length === 2 &&
        riderId &&
        hosts.lookup(id).status === "present"
      ) {
        if (world.getEntity(riderId)?.isValid) hosts.testDriver(id, riderId);
      }
    },
    { namespaces: [NAMESPACE] },
  );
}
