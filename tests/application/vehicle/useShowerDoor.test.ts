import { expect, it } from "vitest";
import { UseShowerDoor } from "../../../src/application/vehicle/useShowerDoor";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { FakeClock, InMemoryRepo, stillTick } from "./fakes";

it("ignores unknown vehicles, SUVs, and a moving camper, and opens and closes for a parked camper once per swing (ADR 0094, 0105)", () => {
  const repo = new InMemoryRepo();
  const clock = new FakeClock();
  const use = new UseShowerDoor(repo, clock);
  expect(use.execute({ vehicleId: asVehicleId("unknown") })).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(use.execute({ vehicleId: suv.id })).toBe(false);
  const car = createVehicle("camper", asVehicleId("car"), 0);
  repo.save(car);
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  for (let i = 0; i < 20; i++) stillTick(car, i);
  clock.tick = 20;
  expect(use.execute({ vehicleId: car.id })).toBe(true);
  clock.tick = 24;
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  clock.tick = 20 + CAMPER_SPEC.doorSwingTicks;
  expect(use.execute({ vehicleId: car.id })).toBe(true);
});
