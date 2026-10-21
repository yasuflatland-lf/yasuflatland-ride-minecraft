import { expect, it } from "vitest";
import { RunShower } from "../../../src/application/vehicle/runShower";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { InMemoryRepo, stillTick } from "./fakes";

it("ignores unknown vehicles, SUVs, and a moving camper, and runs for a parked camper (ADR 0094)", () => {
  const repo = new InMemoryRepo();
  const use = new RunShower(repo);
  expect(use.execute({ vehicleId: asVehicleId("unknown") })).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(use.execute({ vehicleId: suv.id })).toBe(false);
  const car = createVehicle("camper", asVehicleId("car"), 0);
  repo.save(car);
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  for (let i = 0; i < 20; i++) stillTick(car, i);
  expect(use.execute({ vehicleId: car.id })).toBe(true);
  expect(use.execute({ vehicleId: car.id })).toBe(true);
});
