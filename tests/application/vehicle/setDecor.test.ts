import { expect, it } from "vitest";
import type { DecorWorld } from "../../../src/application/vehicle/ports/decor";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import { asVehicleId, type VehicleId } from "../../../src/domain/shared/ids";
import type { DecorPlacement } from "../../../src/domain/vehicle/dock/decor";
import { DECOR_SLOTS } from "../../../src/domain/vehicle/kinds/camper/decor";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { InMemoryRepo } from "./fakes";

class FakeDecorWorld implements DecorWorld {
  readonly saves: [VehicleId, readonly DecorPlacement[]][] = [];
  saveDecor(vehicleId: VehicleId, decor: readonly DecorPlacement[]): void {
    this.saves.push([vehicleId, decor]);
  }
}

function setup(kind: "camper" | "suv") {
  const repo = new InMemoryRepo();
  const world = new FakeDecorWorld();
  const vehicle = createVehicle(kind, asVehicleId("car"), 0);
  repo.save(vehicle);
  return { world, vehicle, decor: new SetDecor(world, repo) };
}

it("saves the camper's whole decor after each change and nothing otherwise", () => {
  const { world, decor } = setup("camper");
  const vehicleId = asVehicleId("car");
  const plant = { vehicleId, slot: "table", item: "potted_plant" };
  expect(decor.execute(plant)).toBe(true);
  expect(world.saves).toEqual([
    ["car", [{ slot: "table", item: "potted_plant" }]],
  ]);
  expect(decor.execute(plant)).toBe(false);
  expect(world.saves).toHaveLength(1);
  expect(decor.execute({ vehicleId, slot: "stove", item: "percolator" })).toBe(
    true,
  );
  const slotIndex = (p: DecorPlacement) =>
    DECOR_SLOTS.findIndex((s) => s.id === p.slot);
  expect(world.saves.at(-1)?.[1]).toEqual(
    [
      { slot: "table", item: "potted_plant" },
      { slot: "stove", item: "percolator" },
    ].sort((a, b) => slotIndex(a) - slotIndex(b)),
  );
  expect(decor.execute({ vehicleId, slot: "table", item: undefined })).toBe(
    true,
  );
  expect(world.saves.at(-1)?.[1]).toEqual([
    { slot: "stove", item: "percolator" },
  ]);
  const before = world.saves.length;
  expect(
    decor.execute({
      vehicleId: asVehicleId("unknown"),
      slot: "table",
      item: "potted_plant",
    }),
  ).toBe(false);
  expect(
    decor.execute({ vehicleId, slot: "nowhere", item: "potted_plant" }),
  ).toBe(false);
  expect(world.saves).toHaveLength(before);
});

it("refuses decor for a kind without a room", () => {
  const { world, vehicle, decor } = setup("suv");
  expect(
    decor.execute({
      vehicleId: vehicle.id,
      slot: "table",
      item: "potted_plant",
    }),
  ).toBe(false);
  expect(world.saves).toEqual([]);
  expect(vehicle.decor()).toEqual([]);
});
