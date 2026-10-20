import { expect, it } from "vitest";
import { UseDockDoor } from "../../../src/application/vehicle/useDockDoor";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { InMemoryRepo } from "./fakes";

it("ignores unknown vehicles and toggles the parked camper's door both ways", () => {
  const repo = new InMemoryRepo();
  const use = new UseDockDoor(repo);
  expect(use.execute({ vehicleId: "unknown" })).toBe(false);
  const car = createVehicle("camper", "car", 0);
  repo.save(car);
  expect(use.execute({ vehicleId: car.id })).toBe(false);
  const tick = (time: number) =>
    car.tick({
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
  for (let i = 0; i < 20; i++) tick(i);
  for (const [time, open] of [
    [20, true],
    [21, false],
  ] as const) {
    expect(use.execute({ vehicleId: car.id })).toBe(true);
    const doors = tick(time).dock?.cells.filter((c) => c.block.type === "door");
    expect(doors).toHaveLength(3);
    expect(
      doors?.every((c) => c.block.type === "door" && c.block.open === open),
    ).toBe(true);
  }
});
