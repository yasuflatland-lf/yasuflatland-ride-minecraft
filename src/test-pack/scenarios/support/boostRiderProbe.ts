import { type Entity, system } from "@minecraft/server";
import { ENTITY_TYPE } from "../../../infrastructure/vehicle/bedrock/identifiers";
import {
  BOOST_RIDER_PROBE,
  TEST_BOOST_RIDER_EVENT,
} from "../../../infrastructure/vehicle/testHooks/testBoostCrew";
import { type Arena, waitUntil } from "../../arena";

export async function withBoostRider<T>(
  a: Arena,
  car: Entity,
  run: (rider: Entity) => Promise<T>,
): Promise<T> {
  const rider = a.dim.spawnEntity(BOOST_RIDER_PROBE, car.location);
  try {
    const rideable = car.getComponent("minecraft:rideable");
    if (car.typeId === ENTITY_TYPE.camper) {
      system.sendScriptEvent(
        TEST_BOOST_RIDER_EVENT,
        [car.id, rider.id].join(","),
      );
      if (
        !(await waitUntil(10, () => rideable?.getRiders()[0]?.id === rider.id))
      )
        throw new Error("Camper rider did not board");
    } else if (!rideable?.addRider(rider))
      throw new Error("Damageable test rider could not board");
    return await run(rider);
  } finally {
    if (rider.isValid) rider.remove();
  }
}
