import { expect, it, vi } from "vitest";
import { FindBedSpawnCell } from "../../../src/application/vehicle/findBedSpawnCell";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { roomCells } from "../../../src/domain/vehicle/kinds/camper/room";
import { defined } from "../../support/defined";
import { parkedCamper } from "./fakes";

it("returns the parked camper's bed cell and ignores unknown vehicles and other cells (ADR 0182)", () => {
  const { car, pose, repo } = parkedCamper();
  const use = new FindBedSpawnCell(repo);
  const { x, y, z } = defined(
    roomCells(pose, false).find((c) => c.block.type === "bed"),
    "bed cell",
  );
  const cell = { x, y, z };
  expect(use.execute({ vehicleId: car.id, cell })).toEqual(cell);
  expect(
    use.execute({ vehicleId: asVehicleId("unknown"), cell }),
  ).toBeUndefined();
  expect(
    use.execute({ vehicleId: car.id, cell: { ...cell, y: y + 1 } }),
  ).toBeUndefined();
});

it("returns the vehicle's spawn override for the pressed cell (ADR 0182)", () => {
  const { car, repo } = parkedCamper();
  const cell = { x: 1, y: 65, z: -2 };
  const spawn = { x: 0, y: 65, z: -2 };
  const answer = vi.spyOn(car, "bedSpawnCell").mockReturnValue(spawn);
  expect(
    new FindBedSpawnCell(repo).execute({ vehicleId: car.id, cell }),
  ).toEqual(spawn);
  expect(answer).toHaveBeenCalledExactlyOnceWith(cell);
});
