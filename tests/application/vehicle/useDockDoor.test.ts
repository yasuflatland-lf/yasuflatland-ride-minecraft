import { expect, it } from "vitest";
import { UseDockDoor } from "../../../src/application/vehicle/useDockDoor";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { FakeClock, InMemoryRepo, stillTick } from "./fakes";

it("ignores unknown vehicles and SUVs, and toggles the parked camper's door both ways, once per swing (ADR 0068, 0105)", () => {
  const repo = new InMemoryRepo();
  const clock = new FakeClock();
  const use = new UseDockDoor(repo, clock);
  expect(use.execute({ vehicleId: asVehicleId("unknown") })).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(use.execute({ vehicleId: suv.id })).toBe(false);
  const car = createVehicle("camper", asVehicleId("car"), 0);
  repo.save(car);
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  for (let i = 0; i < 20; i++) stillTick(car, i);
  for (const [time, open] of [
    [20, true],
    [20 + CAMPER_SPEC.doorSwingTicks, false],
  ] as const) {
    clock.tick = time;
    expect(use.execute({ vehicleId: car.id })).toBe(true);
    clock.tick = time + 3;
    expect(use.execute({ vehicleId: car.id })).toBe(false);
    const doors = stillTick(car, time).dock?.cells.filter(
      (c) => c.block.type === "door",
    );
    expect(doors).toHaveLength(3);
    expect(
      doors?.every((c) => c.block.type === "door" && c.block.open === open),
    ).toBe(true);
  }
});
