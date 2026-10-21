import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { RunShower } from "../../../src/application/vehicle/runShower";
import { TapDockFloor } from "../../../src/application/vehicle/tapDockFloor";
import { UseShowerDoor } from "../../../src/application/vehicle/useShowerDoor";
import { asDimensionId, asVehicleId } from "../../../src/domain/shared/ids";
import { showerFloorCell } from "../../../src/domain/vehicle/kinds/camper/room";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import type { VehicleRepository } from "../../../src/domain/vehicle/vehicleRepository";
import { parkedCamper } from "./fakes";

const cmd = {
  dimensionId: asDimensionId("overworld"),
  cell: { x: 1, y: 64, z: 2 },
  player: { x: 1.5, y: 65, z: 2.5 },
};

function stubs(
  owned: boolean,
  target: "showerDoor" | "shower" | undefined,
  result: boolean,
  found = true,
) {
  const world = {
    floorOwner: vi.fn(() => (owned ? asVehicleId("car") : undefined)),
  };
  const vehicle = { floorTap: vi.fn(() => target) };
  const repo = {
    get: vi.fn(() => (found ? vehicle : undefined)),
  } as unknown as VehicleRepository;
  const showerDoor = { execute: vi.fn(() => result) };
  const shower = { execute: vi.fn(() => result) };
  const tap = new TapDockFloor(
    world,
    repo,
    showerDoor as unknown as UseShowerDoor,
    shower as unknown as RunShower,
  );
  return { world, vehicle, repo, showerDoor, shower, tap };
}

it("routes a floor tap to the use case the vehicle names, only for an owned floor (ADR 0094)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(undefined, "showerDoor" as const, "shower" as const),
      fc.boolean(),
      fc.boolean(),
      (target, owned, result) => {
        const s = stubs(owned, target, result);
        const out = s.tap.execute(cmd);
        expect(s.world.floorOwner).toHaveBeenCalledExactlyOnceWith(
          asDimensionId("overworld"),
          cmd.cell,
        );
        if (!owned) {
          expect(s.repo.get).not.toHaveBeenCalled();
          expect(s.showerDoor.execute).not.toHaveBeenCalled();
          expect(s.shower.execute).not.toHaveBeenCalled();
          expect(out).toBe(false);
          return;
        }
        expect(s.vehicle.floorTap).toHaveBeenCalledExactlyOnceWith(
          cmd.cell,
          cmd.player,
        );
        const id = { vehicleId: asVehicleId("car") };
        if (target === "showerDoor")
          expect(s.showerDoor.execute).toHaveBeenCalledExactlyOnceWith(id);
        else expect(s.showerDoor.execute).not.toHaveBeenCalled();
        if (target === "shower")
          expect(s.shower.execute).toHaveBeenCalledExactlyOnceWith(id);
        else expect(s.shower.execute).not.toHaveBeenCalled();
        expect(out).toBe(target ? result : false);
      },
    ),
  );
});

it("ignores a floor whose vehicle is gone", () => {
  const s = stubs(true, "showerDoor", true, false);
  expect(s.tap.execute(cmd)).toBe(false);
  expect(s.showerDoor.execute).not.toHaveBeenCalled();
  expect(s.shower.execute).not.toHaveBeenCalled();
});

it("routes a real parked camper's shower floor tap to its door, and ignores an SUV", () => {
  const { car, pose, repo, tick } = parkedCamper();
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  const floor = showerFloorCell(pose);
  const player = { x: floor.x + 1.5, y: floor.y + 1, z: floor.z + 0.5 };
  const tap = (world: { floorOwner: () => ReturnType<typeof asVehicleId> }) =>
    new TapDockFloor(
      world,
      repo,
      new UseShowerDoor(repo),
      new RunShower(repo),
    ).execute({ dimensionId: asDimensionId("overworld"), cell: floor, player });
  expect(tap({ floorOwner: () => car.id })).toBe(true);
  expect(tick(21).stepCommands).toContainEqual({
    type: "setProperty",
    name: "shower_door",
    value: 0.1,
  });
  expect(tap({ floorOwner: () => suv.id })).toBe(false);
});
