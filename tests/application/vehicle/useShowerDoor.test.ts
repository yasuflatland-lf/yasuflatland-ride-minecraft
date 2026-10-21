import { expect, it } from "vitest";
import { UseShowerDoor } from "../../../src/application/vehicle/useShowerDoor";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import { InMemoryRepo } from "./fakes";

const tick = (vehicle: Vehicle, time: number) =>
  vehicle.tick({
    tick: time,
    riders: [],
    deckSeatInputs: [],
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    targets: () => [],
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
  });

it("ignores unknown vehicles, SUVs, and a moving camper, and opens and closes for a parked camper (ADR 0094)", () => {
  const repo = new InMemoryRepo();
  const use = new UseShowerDoor(repo);
  expect(use.execute({ vehicleId: asVehicleId("unknown") })).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(use.execute({ vehicleId: suv.id })).toBe(false);
  const car = createVehicle("camper", asVehicleId("car"), 0);
  repo.save(car);
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  for (let i = 0; i < 20; i++) tick(car, i);
  expect(use.execute({ vehicleId: car.id })).toBe(true);
  expect(use.execute({ vehicleId: car.id })).toBe(true);
});
