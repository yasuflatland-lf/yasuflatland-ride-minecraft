import {
  TEST_NAV_EVENT,
  TEST_NAV_RESULT,
} from "../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, requestProbe, wait, waitUntil, withCar } from "../arena";
import type { Outcome } from "../outcome";
import { withBoostRider } from "./support/boostRiderProbe";

export async function suvNavPassengerRefused(a: Arena): Promise<Outcome> {
  return withCar(a, 8.5, 8.5, 0, async (car) => {
    await wait(3);
    return withBoostRider(a, car, () =>
      withBoostRider(a, car, async (passenger) => {
        const rideable = car.getComponent("minecraft:rideable");
        if (
          !(await waitUntil(
            8,
            () => rideable?.getRiders()[1]?.id === passenger.id,
          ))
        ) {
          return {
            pass: false,
            detail: "Passenger probe did not reach seat one",
          };
        }

        const result = await requestProbe(
          TEST_NAV_EVENT,
          TEST_NAV_RESULT,
          car.id,
          passenger.id,
          12,
        );
        return {
          pass: result === `${car.id},nav_driver_only`,
          detail: result ?? "No response from nav probe",
        };
      }),
    );
  });
}
